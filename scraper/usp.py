"""What each product is selling, read from its whole Nykaa image gallery and page text, checked against
what its buyers actually say, then compared with its direct rivals.

    python -m scraper.usp pilot --spec data/usp/pilot.json     # gallery fetch -> stage A -> stage B -> report
    python -m scraper.usp run [--dry-run] [--budget 5]         # every anchor product vs its rivals -> Supabase (017)

Stage A (one request per product): every gallery image (up to MAX_IMAGES, resized by Nykaa's CDN),
the product page text, and a sample of its reviews with the review-tag counts. Returns the main USP,
ranked benefits, proof, hero ingredients, who it is for, and whether buyers echo each claim.

Stage B (one request per comparison group): the stage A results for products in the same category and
price band, with shelf rank and ratings. Returns what everyone claims, what only one product claims,
how the anchor's message stands against its direct rivals, and benefits buyers value that nobody claims.

Both stages go through the Message Batches API (half price; results usually within minutes). Spend is
computed from each response's own usage figures and checked against USP_MONTHLY_BUDGET_USD.
"""
from __future__ import annotations

import argparse
import asyncio
import base64
import hashlib
import json
import logging
import os
import sys
import time
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

import httpx

from . import config
from .db import connect

log = logging.getLogger("usp")

MODEL = os.getenv("USP_MODEL", "claude-sonnet-5-5")
PRICE_IN, PRICE_OUT = 2.00, 10.00          # $ per million tokens, Sonnet 5.5; batch pays half
BATCH_DISCOUNT = 0.5
MAX_IMAGES = 12
IMAGE_SIDE = 800                           # Nykaa's CDN resizes on request; small print stays legible
THOROUGH_BRANDS = {"innisfree", "laneige", "beautyofjoseon", "thefaceshop", "etude", "cosrx", "anua", "tirtir", "skin1004"}
REVIEWS_THOROUGH, REVIEWS_LIGHT = 150, 30
MIN_REVIEWS_TO_JUDGE = 20
GALLERY_MAX_AGE_DAYS = 7                   # gallery links are re-read weekly; the photo fingerprint decides re-analysis
MONTHLY_BUDGET_USD = float(os.getenv("USP_MONTHLY_BUDGET_USD", "3"))
# spend estimate per request, from the 5 Oct pilot ($0.05/product at high effort, $0.07/comparison), rounded up
EST_PRODUCT = {"high": 0.06, "medium": 0.035}
EST_COMPARISON = 0.08
USP_TEXT_DAYS = 3 * 365                    # review text reaches 3 years back for the comparison set (signals_run --only usp-texts)
OUT = Path(config.DATA_DIR) / "usp"
GALLERY_DIR = Path(config.DATA_DIR) / "cache" / "galleries"


def _norm(s: str) -> str:
    return "".join(ch for ch in s.lower() if ch.isalnum())


# ------------------------------------------------------------------ inputs

async def fetch_galleries(product_ids: list[str]) -> dict[str, list[str]]:
    """Gallery image URLs from Nykaa's product data (one request per product not cached yet)."""
    from playwright.async_api import async_playwright
    from .nykaa import open_browser
    from .product_details import fetch_details
    GALLERY_DIR.mkdir(parents=True, exist_ok=True)
    out: dict[str, list[str]] = {}
    todo = []
    for pid in product_ids:
        f = GALLERY_DIR / f"{pid}.json"
        if f.exists() and time.time() - f.stat().st_mtime < GALLERY_MAX_AGE_DAYS * 86400:
            out[pid] = json.loads(f.read_text())["images"]
        else:
            todo.append(pid)
    if todo:
        async with async_playwright() as pw:
            browser, ctx, page = await open_browser(pw)
            try:
                await page.goto(config.CATEGORIES[0].url, wait_until="domcontentloaded", timeout=config.NAV_TIMEOUT_MS)
                await page.wait_for_timeout(1500)
                from .nykaa import BlockedError
                for pid in todo:
                    resp = None
                    for attempt in range(2):       # a dropped connection is retried once after a pause and a fresh page
                        try:
                            resp = await fetch_details(page, pid); break
                        except BlockedError:
                            raise
                        except Exception as e:  # noqa: BLE001
                            log.warning("gallery %s attempt %d failed: %s", pid, attempt + 1, str(e).splitlines()[0])
                            await asyncio.sleep(20)
                            await page.goto(config.CATEGORIES[0].url, wait_until="domcontentloaded", timeout=config.NAV_TIMEOUT_MS)
                            await page.wait_for_timeout(2000)
                    if resp is None:
                        continue
                    imgs = [c["url"] for c in (resp.get("carousel") or []) if c.get("mediaType") == "image" and c.get("url")]
                    if not imgs and resp.get("image_url"):
                        imgs = [resp["image_url"]]
                    (GALLERY_DIR / f"{pid}.json").write_text(json.dumps({"images": imgs, "fetched_at": datetime.now(timezone.utc).isoformat()}))
                    out[pid] = imgs
                    await asyncio.sleep(config.DETAILS_DELAY_SEC)
            finally:
                await browser.close()
    return out


def sized(url: str) -> str:
    return url.replace("/media/catalog/product/", f"/media/catalog/product/tr:h-{IMAGE_SIDE},w-{IMAGE_SIDE},cm-pad_resize/", 1) \
        if "/tr:" not in url else url


def download_images(urls: list[str]) -> list[tuple[str, bytes]]:
    out = []
    with httpx.Client(timeout=30, follow_redirects=True) as h:
        for u in urls[:MAX_IMAGES]:
            r = h.get(sized(u))
            if r.status_code == 200 and r.headers.get("content-type", "").startswith("image/"):
                out.append((r.headers["content-type"].split(";")[0], r.content))
    return out


def gallery_fingerprint(images: list[tuple[str, bytes]]) -> str:
    """Changes when any photo is added, removed, reordered or replaced: the free change check."""
    return hashlib.sha256(b"".join(hashlib.sha256(b).digest() for _, b in images)).hexdigest()


def page_text(client, pid: str) -> dict:
    d = client.table("product_details").select("usp_summary,usp_points,description_text,key_ingredients,concerns,skin_types,formulation,how_to_use,country_name") \
        .eq("product_id", pid).limit(1).execute().data
    return d[0] if d else {}


def reviews_for(client, pid: str, brand: str) -> dict:
    """Most-liked and most-recent reviews with text, plus Nykaa's review-tag counts over all stored reviews."""
    rows, off = [], 0
    while True:
        d = client.table("review_texts").select("rating,title,body,likes,created_on,is_buyer,aspects").eq("product_id", pid) \
            .order("review_id").range(off, off + 999).execute().data
        rows += d
        if len(d) < 1000:
            break
        off += 1000
    tags: Counter = Counter()
    for r in rows:
        for a in r.get("aspects") or []:
            if a.get("displayText"):
                tags[(a["displayText"], "negative" if str(a.get("sentimentValue", "")).lower().startswith("neg") else "positive")] += 1
    texted = [r for r in rows if (r.get("body") or "").strip() or (r.get("title") or "").strip()]
    n = REVIEWS_THOROUGH if _norm(brand) in THOROUGH_BRANDS else REVIEWS_LIGHT
    liked = sorted(texted, key=lambda r: -(r.get("likes") or 0))[: n // 2]
    seen = {id(r) for r in liked}
    recent = [r for r in sorted(texted, key=lambda r: r["created_on"], reverse=True) if id(r) not in seen][: n - len(liked)]
    sample = [{"rating": r["rating"], "date": r["created_on"][:10], "likes": r.get("likes") or 0,
               "text": f"{(r.get('title') or '').strip()} — {(r.get('body') or '').strip()}"[:600]} for r in liked + recent]
    rated = [r["rating"] for r in rows if r.get("rating")]
    return {"stored_reviews": len(rows), "with_text": len(texted), "avg_rating_of_stored": round(sum(rated) / len(rated), 2) if rated else None,
            "tag_counts": [{"tag": t, "sentiment": s, "count": c} for (t, s), c in tags.most_common(25)], "sample": sample}


# ------------------------------------------------------------------ stage A

SYSTEM_A = """You are a senior beauty-brand strategist analysing how one skincare product sells itself on Nykaa (India's largest beauty retailer). You receive every image in the product's Nykaa gallery, in order, plus the text on its product page and a sample of its buyers' reviews with Nykaa's review-tag counts.

Your job is to extract what the product is selling, not to describe how the images look. Never report layout, photo order, shot type, packaging appearance, pack sizes or how many images show the product. Image numbers are used only as evidence references.

Work in this order:
1. Read every image and transcribe every claim, number, ingredient, benefit and certification printed on it. Read small print and footnotes; they qualify the clinical claims.
2. Decide the main USP: the single proposition the whole listing is built to make a shopper believe. Weigh, in this order: what the first image and the largest headlines say; what is repeated across images and the product title; what the brand spent proof on (clinical numbers, before/after, time-to-result); and the page text. The USP is the specific promise, not a category label: not "hydrating toner" but, for example, "instant hydration that also repairs the barrier in three days, gentle enough to pair with retinol". If two propositions carry equal weight, say so and give the runner-up; do not force a single answer.
3. Rank the key benefits by how heavily the listing communicates them, with the proof behind each.
4. Work out exactly who the product is for: skin types, concerns, age or life stage, routine role, and the occasion or problem it solves. Mark each item as stated (printed on images or page) or implied (inferred from models, wording, comparisons or price), and say what the inference rests on. Do not default to "all skin types" unless the listing actually says so.
5. Check the reviews: for the USP and each key benefit, judge whether buyers echo it, rarely mention it, or contradict it. Use the review-tag counts and the review text; quote buyers verbatim (short quotes). Then list what buyers repeatedly value or complain about that the listing does not advertise. If there are fewer than 20 reviews with text, mark verdicts as insufficient rather than guessing.

Be precise and conservative: never invent a claim that is not shown or written; if text in an image is unreadable, say so. Write for a brand manager deciding how this product competes."""

_S = {"type": "string"}
_SA = {"type": "array", "items": {"type": "string"}}
def _obj(props: dict, req: list[str] | None = None) -> dict:
    return {"type": "object", "properties": props, "required": req or list(props), "additionalProperties": False}
_VERDICT = {"type": "string", "enum": ["echoed", "rarely_mentioned", "contradicted", "insufficient_reviews"]}
_BASIS = {"type": "string", "enum": ["stated", "implied"]}

SCHEMA_A = _obj({
    "claims_transcribed": {"type": "array", "items": _obj({"image": {"type": "integer"}, "text": _S})},
    "main_usp": _obj({
        "statement": _S, "brand_words": _S, "why_this_is_the_usp": _S,
        "evidence_images": {"type": "array", "items": {"type": "integer"}},
        "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
        "runner_up": _S,
    }),
    "key_benefits": {"type": "array", "items": _obj({
        "benefit": _S, "emphasis": {"type": "integer", "description": "1 (passing mention) to 5 (dominant)"},
        "proof_type": {"type": "string", "enum": ["clinical_number", "instrumental_test", "consumer_perception_study", "before_after", "time_to_result", "dermatologist_endorsement", "ingredient_logic_only", "none"]},
        "proof_detail": _S, "evidence_images": {"type": "array", "items": {"type": "integer"}},
    })},
    "hero_ingredients": {"type": "array", "items": _obj({"ingredient": _S, "claimed_role": _S})},
    "target_consumer": _obj({
        "summary": _S,
        "attributes": {"type": "array", "items": _obj({"dimension": {"type": "string", "enum": ["skin_type", "concern", "age_or_life_stage", "routine_role", "occasion", "values", "price_positioning"]},
                                                         "value": _S, "basis": _BASIS, "evidence": _S})},
    }),
    "trust_and_safety_claims": _SA,
    "emotional_and_brand_angle": _S,
    "proof_strength": _obj({"rating": {"type": "string", "enum": ["strong", "moderate", "weak"]}, "reason": _S}),
    "review_check": _obj({
        "reviews_considered": {"type": "integer"},
        "usp_verdict": _VERDICT, "usp_explanation": _S, "usp_quotes": _SA,
        "benefit_verdicts": {"type": "array", "items": _obj({"benefit": _S, "verdict": _VERDICT, "explanation": _S, "quotes": _SA})},
        "valued_but_not_advertised": {"type": "array", "items": _obj({"theme": _S, "how_often": _S, "quotes": _SA})},
        "recurring_complaints": {"type": "array", "items": _obj({"theme": _S, "how_often": _S, "quotes": _SA})},
    }),
    "one_line_summary": _S,
})


def stage_a_request(p: dict, images: list[tuple[str, bytes]], text: dict, reviews: dict, effort: str = "high") -> dict:
    content: list[dict] = []
    for i, (mt, data) in enumerate(images, 1):
        content.append({"type": "text", "text": f"Image {i}"})
        content.append({"type": "image", "source": {"type": "base64", "media_type": mt, "data": base64.standard_b64encode(data).decode()}})
    facts = {
        "brand": p["brand"], "product_name": p["name"], "category": p["category_label"], "price_inr": p.get("price"), "mrp_inr": p.get("mrp"),
        "nykaa_rank_in_category": p.get("rank") or "not in the top 100", "rating": p.get("rating"), "ratings_count": p.get("rating_count"),
        "page_text": {k: v for k, v in text.items() if v},
    }
    content.append({"type": "text", "text": "PRODUCT PAGE FACTS\n" + json.dumps(facts, ensure_ascii=False, indent=1)})
    content.append({"type": "text", "text": f"REVIEWS (stored: {reviews['stored_reviews']}, with text: {reviews['with_text']}; sample below; "
                    f"judge 'insufficient_reviews' if fewer than {MIN_REVIEWS_TO_JUDGE} have text)\nReview-tag counts: "
                    + json.dumps(reviews["tag_counts"], ensure_ascii=False) + "\nSample:\n"
                    + "\n".join(f"- [{r['rating']}★, {r['date']}, {r['likes']} likes] {r['text']}" for r in reviews["sample"])})
    content.append({"type": "text", "text": "Analyse this listing as instructed and return the JSON."})
    return {"model": MODEL, "max_tokens": 16000, "system": SYSTEM_A, "messages": [{"role": "user", "content": content}],
            "output_config": {"effort": effort, "format": {"type": "json_schema", "schema": SCHEMA_A}}}


# ------------------------------------------------------------------ stage B

SYSTEM_B = """You are a senior beauty-brand strategist comparing how directly competing products sell themselves on Nykaa India. You receive, for each product in one category and price band, a structured analysis of its gallery and page (its main USP, ranked benefits with proof, target consumer, and whether its buyers echo the claims), plus its shelf rank, price and ratings. One brand is the anchor: the brand the reader works for.

Compare the messages, not the products' quality. Be specific and evidence-based, naming the products. Identify:
- table stakes: claims most products in the group make, which therefore do not differentiate;
- each product's distinct angle: what it promises that its rivals do not, and how believable that is (proof, and whether buyers echo it);
- the anchor's position: whose message it overlaps with, what only it says, where its message is weaker or less proven than a rival's, and where its buyers' reviews support or undercut it relative to rivals' buyers;
- white space: benefits or concerns buyers in this group repeatedly value, or targets, that no listing claims clearly.
Where shelf rank or ratings suggest a message is working or not, say so, but do not attribute rank to messaging alone: paid slots, price and brand size also drive rank. Write for the anchor's brand manager."""

SCHEMA_B = _obj({
    "group_summary": _S,
    "table_stakes": {"type": "array", "items": _obj({"claim": _S, "products_making_it": _SA})},
    "products": {"type": "array", "items": _obj({
        "product": _S, "distinct_angle": _S, "credibility": {"type": "string", "enum": ["strong", "moderate", "weak"]},
        "credibility_reason": _S, "buyers_echo_it": _S,
    })},
    "anchor_position": _obj({
        "overlaps_with": {"type": "array", "items": _obj({"rival": _S, "shared_message": _S})},
        "unique_to_anchor": _SA,
        "weaker_than_rivals": {"type": "array", "items": _obj({"rival": _S, "where": _S})},
        "stronger_than_rivals": {"type": "array", "items": _obj({"rival": _S, "where": _S})},
        "review_resonance_vs_rivals": _S,
        "verdict": _S,
    }),
    "white_space": {"type": "array", "items": _obj({"opportunity": _S, "evidence": _S})},
})


def stage_b_request(group: dict, analyses: dict[str, dict], products: dict[str, dict]) -> dict:
    items = []
    for pid in group["products"]:
        a = analyses.get(pid)
        p = products.get(pid)
        if not a or not p:
            continue
        items.append({"product": f"{p['brand']} {p['name']}", "is_anchor": _norm(p["brand"]) == _norm(config.ANCHOR_BRAND),
                      "role": (group.get("roles") or {}).get(pid, "anchor"), "origin": p.get("origin"),
                      "price_inr": p.get("price"), "nykaa_rank": p.get("rank") or "not in top 100", "rating": p.get("rating"), "ratings_count": p.get("rating_count"),
                      "paid_slot_today": p.get("is_ad"), "analysis": {k: a[k] for k in ("main_usp", "key_benefits", "hero_ingredients", "target_consumer", "trust_and_safety_claims", "emotional_and_brand_angle", "proof_strength", "review_check", "one_line_summary")}})
    msg = f"GROUP: {group['label']}\nANCHOR: {config.ANCHOR_BRAND}\n\n" + json.dumps(items, ensure_ascii=False, indent=1) + "\n\nCompare as instructed and return the JSON."
    return {"model": MODEL, "max_tokens": 16000, "system": SYSTEM_B, "messages": [{"role": "user", "content": msg}],
            "output_config": {"effort": "high", "format": {"type": "json_schema", "schema": SCHEMA_B}}}


# ------------------------------------------------------------------ batch runner

def run_batch(requests: dict[str, dict]) -> tuple[dict[str, dict], float]:
    """Submit one batch, wait for it, return parsed JSON per custom_id and the dollars spent."""
    import anthropic
    from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
    from anthropic.types.messages.batch_create_params import Request
    client = anthropic.Anthropic()
    batch = client.messages.batches.create(requests=[Request(custom_id=k, params=MessageCreateParamsNonStreaming(**v)) for k, v in requests.items()])
    log.info("batch %s submitted (%d requests)", batch.id, len(requests))
    while True:
        b = client.messages.batches.retrieve(batch.id)
        if b.processing_status == "ended":
            break
        log.info("batch %s: %s, %d processing", batch.id, b.processing_status, b.request_counts.processing)
        time.sleep(30)
    out, cost = {}, 0.0
    for r in client.messages.batches.results(batch.id):
        if r.result.type != "succeeded":
            log.error("%s: %s %s", r.custom_id, r.result.type, getattr(r.result, "error", ""))
            continue
        m = r.result.message
        u = m.usage
        cost += ((u.input_tokens + (u.cache_read_input_tokens or 0) + (u.cache_creation_input_tokens or 0)) * PRICE_IN + u.output_tokens * PRICE_OUT) / 1e6 * BATCH_DISCOUNT
        if m.stop_reason in ("refusal", "max_tokens"):
            log.error("%s: stopped with %s", r.custom_id, m.stop_reason)
            continue
        text = next((blk.text for blk in m.content if blk.type == "text"), "")
        try:
            out[r.custom_id] = json.loads(text)
            out[r.custom_id]["_usage"] = {"input": u.input_tokens, "output": u.output_tokens}
        except json.JSONDecodeError:
            log.error("%s: unparseable output", r.custom_id)
    return out, cost


# ------------------------------------------------------------------ pilot

def pilot(spec_path: Path) -> int:
    from dotenv import load_dotenv
    load_dotenv()
    spec = json.loads(spec_path.read_text())
    client = connect()
    OUT.mkdir(parents=True, exist_ok=True)
    label = {"toner": "Toner & mist", "face_moisturizer": "Moisturiser"}
    products: dict[str, dict] = {}
    for g in spec["groups"]:
        for pid in g["products"]:
            s = client.table("web_latest_shelf").select("product_id,brand,name,price,mrp,rank,rating,rating_count,is_ad,origin,subcategory") \
                .eq("product_id", pid).eq("subcategory", g["category"]).limit(1).execute().data
            if not s:
                s = client.table("web_brand_catalog").select("product_id,brand,name,price,mrp,rating,rating_count").eq("product_id", pid).limit(1).execute().data
            p = s[0]; p["category_label"] = label.get(g["category"], g["category"])
            products[pid] = p
    galleries = asyncio.run(fetch_galleries(list(products)))
    missing = [pid for pid in products if pid not in galleries]
    if missing:
        log.error("no gallery for %s; they are left out of this run", missing)
    req_a, meta = {}, {}
    for pid, p in products.items():
        if pid in missing:
            continue
        imgs = download_images(galleries[pid])
        text = page_text(client, pid)
        rv = reviews_for(client, pid, p["brand"])
        req_a[f"a_{pid}"] = stage_a_request(p, imgs, text, rv)
        meta[pid] = {"images": len(imgs), "gallery_fingerprint": gallery_fingerprint(imgs), "reviews_sampled": len(rv["sample"]), "reviews_stored": rv["stored_reviews"]}
        log.info("%s %s: %d images, %d reviews sampled of %d", p["brand"], p["name"][:40], len(imgs), len(rv["sample"]), rv["stored_reviews"])
    res_a, cost_a = run_batch(req_a)
    analyses = {k[2:]: v for k, v in res_a.items()}
    log.info("stage A: %d/%d analysed, $%.3f", len(analyses), len(req_a), cost_a)
    req_b = {f"b_{i}": stage_b_request(g, analyses, products) for i, g in enumerate(spec["groups"])}
    res_b, cost_b = run_batch(req_b)
    log.info("stage B: %d/%d groups, $%.3f", len(res_b), len(req_b), cost_b)
    result = {"run_at": datetime.now(timezone.utc).isoformat(), "model": MODEL, "cost_usd": round(cost_a + cost_b, 4),
              "products": {pid: {**products[pid], **meta[pid], "analysis": analyses.get(pid)} for pid in products},
              "groups": [{**g, "comparison": res_b.get(f"b_{i}")} for i, g in enumerate(spec["groups"])]}
    (OUT / f"pilot-{datetime.now():%Y-%m-%d}.json").write_text(json.dumps(result, ensure_ascii=False, indent=1))
    log.info("total $%.3f -> %s", cost_a + cost_b, OUT)
    return 0


# ------------------------------------------------------------------ production run

def month_spend(client) -> float:
    start = datetime.now(timezone.utc).strftime("%Y-%m-01")
    return sum(float(r["cost_usd"]) for r in client.table("usp_spend").select("cost_usd").gte("spent_at", start).execute().data)


def record_spend(client, stage: str, requests: int, cost: float) -> None:
    client.table("usp_spend").insert({"stage": stage, "requests": requests, "cost_usd": round(cost, 4)}).execute()


def product_facts(client, pid: str, row: dict) -> dict:
    """Shelf facts for the prompt: today's shelf row when the product is on one, else its catalogue row."""
    from .rivals import DOC_SECTIONS
    s = client.table("web_latest_shelf").select("product_id,brand,name,price,mrp,rank,rating,rating_count,is_ad,origin") \
        .eq("product_id", pid).eq("subcategory", row["subcategory"]).limit(1).execute().data
    if not s:
        s = client.table("web_brand_catalog").select("product_id,brand,name,price,mrp,rating,rating_count").eq("product_id", pid).limit(1).execute().data
    p = {**(s[0] if s else {}), "product_id": pid, "brand": row["brand"], "name": row["name"], "origin": row.get("origin")}
    p.setdefault("price", row.get("price")); p.setdefault("rating_count", row.get("rating_count"))
    p["category_label"] = DOC_SECTIONS.get(row["subcategory"], row["subcategory"].replace("_", " "))
    return p


def run(budget: float, force: bool = False, dry_run: bool = False) -> int:
    """One comparison per anchor product (it + its rivals from scraper.rivals). Products are analysed only when
    new or when their gallery changed; comparisons re-run when a member changed or the rival set did."""
    from dotenv import load_dotenv
    load_dotenv()
    from . import rivals as R
    client = connect()
    rows = R.load(client)
    groups, members = [], {}
    for a in R.anchor_products(rows):
        r = R.rivals_for(a, rows)
        roles = {p["product_id"]: f"korean_rival_{i}" for i, p in enumerate(r["korean"], 1)}
        if r["indian"]: roles[r["indian"]["product_id"]] = "indian_leader"
        if r["global"]: roles[r["global"]["product_id"]] = "global_rival"
        ids = [a["product_id"], *roles]
        groups.append({"anchor": a["product_id"], "products": ids, "roles": roles, "category": R.ANCHOR_PRODUCTS[a["product_id"]],
                       "label": f"{R.DOC_SECTIONS.get(a['subcategory'], a['subcategory'])}: {a['name'][:80]} vs its direct rivals"})
        for p in [a, *r["korean"], *[x for x in (r["indian"], r["global"]) if x]]:
            members.setdefault(p["product_id"], p)
    stored = {r["product_id"]: r for r in client.table("usp_analyses").select("product_id,gallery_fingerprint,model,analysis").execute().data}
    stored_cmp = {r["anchor_product_id"]: r for r in client.table("usp_comparisons").select("anchor_product_id,products").execute().data}
    products = {pid: product_facts(client, pid, row) for pid, row in members.items()}
    log.info("%d comparisons, %d products", len(groups), len(products))

    galleries = asyncio.run(fetch_galleries(list(products)))
    req_a, meta = {}, {}
    for pid, p in products.items():
        if not galleries.get(pid):
            log.error("%s %s: no gallery, left out", p["brand"], p["name"][:40]); continue
        imgs = download_images(galleries[pid])
        fp = gallery_fingerprint(imgs)
        old = stored.get(pid)
        if old and old["gallery_fingerprint"] == fp and old["model"] == MODEL and not force:
            continue
        effort = "high" if _norm(p["brand"]) in THOROUGH_BRANDS else "medium"
        rv = reviews_for(client, pid, p["brand"])
        req_a[f"a_{pid}"] = stage_a_request(p, imgs, page_text(client, pid), rv, effort)
        meta[pid] = {"images": len(imgs), "gallery_fingerprint": fp, "reviews_sampled": len(rv["sample"]),
                     "reviews_stored": rv["stored_reviews"], "effort": effort}
        log.info("%-16s %-44s %2d images, %3d of %4d reviews, %s", p["brand"][:16], p["name"][:44], len(imgs), len(rv["sample"]), rv["stored_reviews"], effort)

    changed = {k[2:] for k in req_a}
    todo_b = [g for g in groups if force or g["anchor"] not in stored_cmp or set(g["products"]) & changed
              or stored_cmp[g["anchor"]]["products"] != g["products"]]
    est = sum(EST_PRODUCT[m["effort"]] for m in meta.values()) + EST_COMPARISON * len(todo_b)
    spent = month_spend(client)
    log.info("to analyse: %d products, %d comparisons, estimated $%.2f; spent this month $%.2f of $%.2f",
             len(req_a), len(todo_b), est, spent, budget)
    if dry_run:
        return 0
    if spent + est > budget:
        log.error("budget guard: $%.2f spent + $%.2f estimated exceeds the $%.2f monthly budget; nothing sent", spent, est, budget)
        return 3

    OUT.mkdir(parents=True, exist_ok=True)
    analyses = {pid: r["analysis"] for pid, r in stored.items()}
    if req_a:
        res_a, cost_a = run_batch(req_a)
        record_spend(client, "products", len(req_a), cost_a)
        n_ok = 0
        for k, v in res_a.items():
            pid = k[2:]; analyses[pid] = v; n_ok += 1
            client.table("usp_analyses").upsert({"product_id": pid, "analysis": v, "model": MODEL, "cost_usd": round(cost_a / max(1, len(res_a)), 4),
                                                 "analysed_at": datetime.now(timezone.utc).isoformat(),
                                                 **{f: meta[pid][f] for f in ("gallery_fingerprint", "images", "reviews_sampled", "reviews_stored", "effort")}},
                                                on_conflict="product_id").execute()
        log.info("products: %d/%d analysed, $%.3f", n_ok, len(req_a), cost_a)
        spent += cost_a
    todo_b = [g for g in todo_b if g["anchor"] in analyses]
    est_b = EST_COMPARISON * len(todo_b)
    if todo_b and spent + est_b > budget:
        log.error("budget guard: comparisons ($%.2f) would pass the $%.2f budget; products saved, comparisons left for next run", est_b, budget)
        return 3
    if todo_b:
        res_b, cost_b = run_batch({f"b_{g['anchor']}": stage_b_request(g, analyses, products) for g in todo_b})
        record_spend(client, "comparisons", len(todo_b), cost_b)
        for g in todo_b:
            c = res_b.get(f"b_{g['anchor']}")
            if c:
                client.table("usp_comparisons").upsert({"anchor_product_id": g["anchor"], "category": g["category"], "products": g["products"], "roles": g["roles"],
                                                        "comparison": c, "model": MODEL, "cost_usd": round(cost_b / max(1, len(res_b)), 4),
                                                        "analysed_at": datetime.now(timezone.utc).isoformat()},
                                                       on_conflict="anchor_product_id").execute()
        log.info("comparisons: %d/%d, $%.3f", len(res_b), len(todo_b), cost_b)
        spent += cost_b
    (OUT / f"run-{datetime.now():%Y-%m-%d}.json").write_text(json.dumps(
        {"run_at": datetime.now(timezone.utc).isoformat(), "model": MODEL, "month_spend_usd": round(spent, 4), "groups": groups,
         "products": {pid: {**products[pid], **meta.get(pid, {}), "analysis": analyses.get(pid)} for pid in products}},
        ensure_ascii=False, indent=1, default=str))
    log.info("done: spent this month $%.3f", spent)
    return 0


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s", datefmt="%H:%M:%S", stream=sys.stdout)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["pilot", "run"])
    ap.add_argument("--spec", type=Path, help="pilot: the products and groups to analyse")
    ap.add_argument("--budget", type=float, default=MONTHLY_BUDGET_USD, help="this month's spending limit in $ (default USP_MONTHLY_BUDGET_USD)")
    ap.add_argument("--force", action="store_true", help="re-analyse everything, changed or not")
    ap.add_argument("--dry-run", action="store_true", help="fetch inputs and print the estimate; send nothing")
    a = ap.parse_args()
    if a.cmd == "pilot":
        return pilot(a.spec)
    return run(a.budget, force=a.force, dry_run=a.dry_run)


if __name__ == "__main__":
    sys.exit(main())
