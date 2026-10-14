"""Korean for the text that comes from the data, for the site's 한국어 switch (owner request 14 Oct 2026).

    python -m scraper.translate --dry-run            # what is new, how many strings, estimated cost; no API call
    python -m scraper.translate                      # translate what is new -> ko_dictionary (migration 024)
    python -m scraper.translate --budget 8           # this month's spending limit in $ (shared with usp_spend)

The page wording lives in the code (web/lib/i18n.ts). This covers the rest: Nykaa's product-page wording (summaries,
claim points, skin types, concerns, ingredients, formulations, countries, review tags, offers, sub-categories) and
the AI reads (USP analyses and comparisons, image reads, brand-classifier evidence). Each distinct English string is
translated once; later runs only send strings that are new, so keeping it current costs cents.

Not translated, on purpose: product names and brand names (they are names), customer reviews and the quotes taken
from them (they are what buyers wrote), the owner's notes and events (shown as typed), and search keywords (what
shoppers type). The data tables stay English; the site looks strings up by their exact text (web/lib/dict.ts).

Requests go through the Message Batches API (half price), with the same spend log and monthly limit as scraper/usp.py.
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys

from .db import connect, fetch_all
from .usp import BATCH_DISCOUNT, MONTHLY_BUDGET_USD, month_spend, record_spend

log = logging.getLogger("translate")

MODEL = os.getenv("TRANSLATE_MODEL", "claude-opus-5-5")
PRICES = {"claude-opus-5-5": (4.00, 20.00), "claude-sonnet-5-5": (2.00, 10.00), "claude-haiku-5-5": (0.10, 0.50)}  # $ per million tokens
CHUNK_CHARS = 9000            # English characters per request: big enough to share the system prompt, small enough to stay exact
KO_PER_EN_TOKEN = 1.6         # Korean output tokens per English input token (assumed; Korean costs more tokens per word)

SYSTEM = """You translate English text from a beauty-market intelligence dashboard into Korean for a Korean cosmetics brand team (Innisfree / Amorepacific). The readers are Korean marketing and category managers.

Write natural, polished Korean business prose, the way a Korean consulting report or a Korean cosmetics brand's internal deck would say it, not a word-for-word rendering. Use plain declarative endings (-다/-음 style for short labels, -니다 only where the English is a full explanatory sentence). Keep each translation about as short as the English; labels stay labels.

Keep exactly as written, in Latin script:
- brand names (Innisfree, Laneige, Beauty of Joseon, COSRX, Minimalist, The Derma Co, Nykaa, ...) and product names or product-line names;
- technical tokens: SPF, PA++++, UVA/UVB, BHA, AHA, PHA, pH, %, ml, g, ₹, numbers, ratings like 4.3★;
- quoted wording from a pack or ad when the English puts it in quotes: keep the quote in English and add a short Korean gloss in parentheses after it only if the meaning is not obvious.

Translate ingredient names into the standard Korean cosmetic ingredient names used on Korean packaging (e.g. Niacinamide → 나이아신아마이드, Hyaluronic Acid → 히알루론산, Centella Asiatica Extract → 병풀추출물, Green Tea → 녹차, Ceramides → 세라마이드, Salicylic Acid → 살리실산). If an ingredient has no settled Korean name, transliterate it.

Use these dashboard terms consistently:
share of shelf = 진열 점유율; share of search = 검색 점유율; share of demand = 수요 점유율; shelf = 진열(대); top 100 = 상위 100위; rank = 순위; paid slot / sponsored = 광고 자리; unpaid / organic = 비광고 / 자연 노출; reviews = 리뷰; ratings = 평가; claim = 소구점(주장); USP = 핵심 소구점; hero product = 히어로 제품; anchor brand = 기준 브랜드; focus brands = 주요 브랜드; rival = 경쟁 제품/경쟁사; K-beauty = K-뷰티; Indian brands = 인도 브랜드; global = 글로벌; MRP = 정가(MRP); white space = 빈틈(기회); table stakes = 기본 소구점; skin barrier = 피부 장벽; glass skin = 글래스 스킨; dewy = 촉촉한 광채; brightening = 브라이트닝; sebum = 피지; tan = 태닝 자국; dark spots = 잡티; pigmentation = 색소침착; breakouts = 트러블; oily skin = 지성 피부; dry skin = 건성 피부; combination skin = 복합성 피부; sensitive skin = 민감성 피부; acne-prone = 여드름성.

Translate the meaning of Indian-English and Nykaa phrasing ("value for money" = 가성비, "matte finish" = 매트한 마무리, "non-sticky" = 끈적임 없음). Never add, drop or soften a claim, number or hedge. If a string is already Korean, or is only a name, number or token, return it unchanged.

You receive a JSON list of {"i": id, "en": text}. Return every id once with its Korean in "ko"."""

ITEM = {"type": "object", "properties": {"i": {"type": "integer"}, "ko": {"type": "string"}}, "required": ["i", "ko"], "additionalProperties": False}
SCHEMA = {"type": "object", "properties": {"t": {"type": "array", "items": ITEM}}, "required": ["t"], "additionalProperties": False}

# JSON keys in the AI reads that are not prose: enums, ids, product names, and buyers' own words
SKIP_KEYS = {"usp_quotes", "quotes", "claims_transcribed", "confidence", "rating", "verdict", "usp_verdict", "proof_type", "dimension",
             "basis", "evidence_images", "emphasis", "reviews_considered", "products_making_it", "product", "rival", "credibility", "_usage"}


def _walk(obj, out: set[str], key: str | None = None) -> None:
    if key in SKIP_KEYS:
        return
    if isinstance(obj, str):
        if obj.strip():
            out.add(obj)
    elif isinstance(obj, list):
        for x in obj:
            _walk(x, out, key)
    elif isinstance(obj, dict):
        for k, v in obj.items():
            _walk(v, out, k)


def _split_list(v: str) -> list[str]:
    """Same split as web/lib/competeData.ts whoFor(): short target phrases shown as chips."""
    parts = [re.sub(r"^(and|or)\s+", "", x.strip(), flags=re.I) for x in re.split(r",|;|/| and | or ", v, flags=re.I)]
    return [x for x in parts if x and len(x.split()) <= 4]


def collect(client) -> dict[str, str]:
    """Every English data string the site can show, with where it was first seen."""
    found: dict[str, str] = {}
    def add(strings, source: str):
        for s in strings:
            if isinstance(s, str) and s.strip() and not re.fullmatch(r"[\d\s.,%₹+\-–/()★]+", s) and s not in found:
                found[s] = source

    pd = fetch_all(lambda: client.table("product_details").select("product_id,skin_types,concerns,key_ingredients,formulation,country_name,usp_summary,usp_points,review_key_phrases"))
    for r in pd:
        for f in ("skin_types", "concerns", "key_ingredients", "usp_points"):
            add(r.get(f) or [], f"product_details.{f}")
        for f in ("formulation", "country_name", "usp_summary"):
            add([r.get(f)], f"product_details.{f}")
        add([(p or {}).get("text") for p in (r.get("review_key_phrases") or [])], "product_details.review_key_phrases")

    shelf = fetch_all(lambda: client.table("web_latest_shelf").select("offer_message,nykaa_l3,product_id,subcategory").order("subcategory").order("rank").order("product_id"))
    add([r["offer_message"] for r in shelf], "shelf.offer_message"); add([r["nykaa_l3"] for r in shelf], "shelf.nykaa_l3")
    cat = fetch_all(lambda: client.table("web_brand_catalog").select("offer_message,brand,product_id").order("brand").order("product_id"))
    add([r["offer_message"] for r in cat], "catalog.offer_message")

    aspects: set[str] = set()
    for r in fetch_all(lambda: client.table("review_texts").select("review_id,aspects").not_.is_("aspects", "null").order("review_id")):
        aspects.update(a.get("displayText") for a in (r.get("aspects") or []) if a.get("displayText"))
    add(sorted(aspects), "review_texts.aspects")

    for r in fetch_all(lambda: client.table("web_thumbnails").select("product_id,summary,on_image_claims,background,packaging_style,mood").order("product_id")):
        add([r.get("summary"), r.get("background"), r.get("packaging_style"), r.get("mood")], "thumbnails")
        add(r.get("on_image_claims") or [], "thumbnails.on_image_claims")

    for r in fetch_all(lambda: client.table("usp_analyses").select("product_id,analysis").order("product_id")):
        s: set[str] = set(); _walk(r["analysis"], s); add(sorted(s), "usp_analyses")
        for a in r["analysis"].get("target_consumer", {}).get("attributes", []):
            if a.get("dimension") in ("skin_type", "concern"):
                add(_split_list(a.get("value", "")), "usp_analyses.target_fragments")
    for r in fetch_all(lambda: client.table("usp_comparisons").select("anchor_product_id,comparison").order("anchor_product_id")):
        s = set(); _walk(r["comparison"], s); add(sorted(s), "usp_comparisons")

    add([r.get("evidence") for r in fetch_all(lambda: client.table("brand_classification").select("brand,evidence").order("brand"))], "brand_classification.evidence")
    return found


def chunks(items: list[str]) -> list[list[str]]:
    out, cur, n = [], [], 0
    for s in items:
        if cur and n + len(s) > CHUNK_CHARS:
            out.append(cur); cur, n = [], 0
        cur.append(s); n += len(s)
    if cur:
        out.append(cur)
    return out


def request(batch: list[str]) -> dict:
    payload = json.dumps([{"i": i, "en": s} for i, s in enumerate(batch)], ensure_ascii=False)
    return {"model": MODEL, "max_tokens": 32000, "system": SYSTEM,
            "messages": [{"role": "user", "content": payload}],
            "output_config": {"effort": "medium", "format": {"type": "json_schema", "schema": SCHEMA}}}


def estimate(todo: list[str]) -> tuple[int, float]:
    """Token count of the real requests (free endpoint) and the batch-price estimate."""
    import anthropic
    api = anthropic.Anthropic()
    tin = 0
    for b in chunks(todo):
        r = request(b)
        try:
            tin += api.messages.count_tokens(model=r["model"], system=r["system"], messages=r["messages"]).input_tokens
        except anthropic.APIStatusError as e:   # e.g. the account's monthly cap: estimate from characters instead
            log.warning("token count unavailable (%s); estimating from characters", e.message[:80])
            tin += int((len(r["system"]) + len(r["messages"][0]["content"])) / 3.6)
    pin, pout = PRICES[MODEL]
    sys_tokens = len(SYSTEM) // 3
    tout = int((tin - sys_tokens * len(chunks(todo))) * KO_PER_EN_TOKEN)
    return tin, (tin * pin + tout * pout) / 1e6 * BATCH_DISCOUNT


def run(budget: float, dry_run: bool) -> int:
    client = connect()
    found = collect(client)
    have = {r["en"] for r in fetch_all(lambda: client.table("ko_dictionary").select("en").order("en"))} if not dry_run else set()
    todo = sorted(s for s in found if s not in have)
    log.info("%d data strings, %d already translated, %d to translate (%d characters)", len(found), len(found) - len(todo), len(todo), sum(map(len, todo)))
    if not todo:
        return 0
    tin, est = estimate(todo)
    spent = month_spend(client)
    log.info("model %s: %d input tokens in %d requests, estimated $%.2f; spent this month $%.2f of $%.2f",
             MODEL, tin, len(chunks(todo)), est, spent, budget)
    if dry_run:
        return 0
    if spent + est > budget:
        log.error("would exceed this month's budget ($%.2f + $%.2f > $%.2f); raise --budget to go ahead", spent, est, budget)
        return 2
    from .usp import run_batch
    import scraper.usp as usp
    usp.PRICE_IN, usp.PRICE_OUT = PRICES[MODEL]   # run_batch prices the usage it reads back
    parts = chunks(todo)
    res, cost = run_batch({f"t{n}": request(b) for n, b in enumerate(parts)})
    record_spend(client, "translate", len(parts), cost)
    rows = []
    for n, b in enumerate(parts):
        got = {x["i"]: x["ko"] for x in (res.get(f"t{n}") or {}).get("t", [])}
        rows += [{"en": s, "ko": got[i], "source": found[s], "model": MODEL} for i, s in enumerate(b) if got.get(i, "").strip()]
    missing = len(todo) - len(rows)
    for i in range(0, len(rows), 500):
        client.table("ko_dictionary").upsert(rows[i:i + 500], on_conflict="en").execute()
    log.info("translated %d strings for $%.3f%s", len(rows), cost, f"; {missing} came back empty and stay English until the next run" if missing else "")
    return 0


def main() -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--dry-run", action="store_true", help="count and estimate only; no API spend, no writes")
    ap.add_argument("--budget", type=float, default=MONTHLY_BUDGET_USD, help="this month's spending limit in $ (shared with usp.py)")
    a = ap.parse_args()
    return run(a.budget, a.dry_run)


if __name__ == "__main__":
    sys.exit(main())
