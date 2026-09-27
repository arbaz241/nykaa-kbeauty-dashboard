"""What a product's main image shows — the first thing a shopper judges.

    python -m scraper.thumbnails                # up to THUMBNAIL_MAX_PER_RUN products, tracked set first
    python -m scraper.thumbnails --max 400      # a bigger local batch
    python -m scraper.thumbnails --pixels-only  # no vision model, no API key needed
    python -m scraper.thumbnails --refresh      # re-analyse even if the image is unchanged

Two layers, stored in product_thumbnails (migration 014):

  measured from the pixels   background style, lightness, colourfulness, edge density (a proxy for how
                             much text sits on the image), dominant colours
  read by a vision model     shot type, whether a model appears, how much text, the claims printed on
                             the image, packaging style, mood

The image is fetched from Nykaa's CDN, which serves plain images with no bot check. Analysis is skipped
while an image's hash is unchanged, so a re-run costs nothing for products that have not changed their
photography. ANTHROPIC_API_KEY enables the vision layer; without it the pixel layer still runs.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import io
import json
import logging
import os
import sys
import time

import httpx
from PIL import Image, ImageFilter, ImageStat

from . import config
from .db import connect

log = logging.getLogger("thumbnails")

VISION_MODEL = os.getenv("THUMBNAIL_VISION_MODEL", "claude-haiku-4-5-20251001")
MAX_PER_RUN = int(os.getenv("THUMBNAIL_MAX_PER_RUN", "80"))
VISION_SIDE = 512          # the model needs no more than this; smaller images cost fewer tokens

PROMPT = """You are cataloguing product photography for a retail shelf analysis. Describe ONLY what is
visible in this image. Never guess at brand claims that are not printed in the image.

Reply with JSON only, no prose, matching exactly this shape:
{
  "shot_type": "pack_shot" | "model" | "texture" | "lifestyle" | "flat_lay" | "illustration",
  "model_present": true | false,
  "text_density": "none" | "light" | "heavy",
  "on_image_claims": ["each claim printed on the image, verbatim, max 6"],
  "packaging_style": "a few words, e.g. 'white tube, green cap'",
  "mood": "a few words, e.g. 'clinical', 'natural', 'playful'",
  "summary": "one sentence a merchandiser would write about this image"
}"""


def _hash(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:32]


def pixel_features(img: Image.Image) -> dict:
    """Measurable facts about the image: no interpretation, just what the pixels are."""
    rgb = img.convert("RGB")
    small = rgb.copy()
    small.thumbnail((200, 200))

    # Background: sample the border, where a pack shot's white sweep lives.
    w, h = small.size
    border = [small.getpixel((x, y)) for x in range(w) for y in (0, h - 1)]
    border += [small.getpixel((x, y)) for y in range(h) for x in (0, w - 1)]
    lightness = sum(sum(p) / 3 for p in border) / len(border)
    spread = max(sum(p) / 3 for p in border) - min(sum(p) / 3 for p in border)
    background = "white" if lightness > 232 and spread < 60 else "solid" if spread < 70 else "scene"

    # Colourfulness (Hasler & Süsstrunk): how far the image is from grey.
    r, g, b = [list(ch.getdata()) for ch in small.split()[:3]]
    rg = [abs(r[i] - g[i]) for i in range(len(r))]
    yb = [abs(0.5 * (r[i] + g[i]) - b[i]) for i in range(len(r))]
    mean = lambda xs: sum(xs) / len(xs)
    std = lambda xs, m: (sum((x - m) ** 2 for x in xs) / len(xs)) ** 0.5
    m_rg, m_yb = mean(rg), mean(yb)
    colorfulness = (std(rg, m_rg) ** 2 + std(yb, m_yb) ** 2) ** 0.5 + 0.3 * (m_rg ** 2 + m_yb ** 2) ** 0.5

    # Edge density: text and fine detail raise it; a clean pack shot on white keeps it low.
    edges = small.convert("L").filter(ImageFilter.FIND_EDGES)
    edge_density = ImageStat.Stat(edges).mean[0] / 255

    palette = small.quantize(colors=5, method=Image.Quantize.FASTOCTREE)
    counts = sorted(palette.getcolors(), reverse=True)[:5]
    pal = palette.getpalette() or []
    dominant = [
        {"hex": "#%02x%02x%02x" % tuple(pal[i * 3: i * 3 + 3]), "share": round(n / (w * h), 3)}
        for n, i in counts if pal[i * 3: i * 3 + 3]
    ]

    return {
        "width": img.width, "height": img.height,
        "background": background, "bg_lightness": round(lightness, 2),
        "colorfulness": round(colorfulness, 2), "edge_density": round(edge_density, 3),
        "dominant_colors": dominant,
    }


def read_image(client: httpx.Client, url: str) -> tuple[bytes, Image.Image]:
    r = client.get(url, timeout=30, follow_redirects=True, headers={"User-Agent": config.USER_AGENTS[0]})
    r.raise_for_status()
    return r.content, Image.open(io.BytesIO(r.content))


def vision_features(api_key: str, img: Image.Image) -> dict:
    """Ask the vision model what the image shows. Returns {} when the reply is not usable."""
    small = img.convert("RGB")
    small.thumbnail((VISION_SIDE, VISION_SIDE))
    buf = io.BytesIO()
    small.save(buf, format="JPEG", quality=80)
    b64 = base64.standard_b64encode(buf.getvalue()).decode()

    for attempt in range(4):
        r = httpx.post(
            "https://api.anthropic.com/v1/messages",
            headers={"x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"},
            json={
                "model": VISION_MODEL, "max_tokens": 500, "temperature": 0,
                "messages": [{"role": "user", "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": b64}},
                    {"type": "text", "text": PROMPT},
                ]}],
            },
            timeout=90,
        )
        if r.status_code in (429, 529):          # rate limited / overloaded: back off and retry
            wait = 5 * (attempt + 1)
            log.warning("vision %s; retrying in %ss", r.status_code, wait)
            time.sleep(wait)
            continue
        r.raise_for_status()
        text = "".join(part.get("text", "") for part in r.json()["content"]).strip()
        text = text[text.find("{"): text.rfind("}") + 1]
        try:
            out = json.loads(text)
        except json.JSONDecodeError:
            log.warning("vision reply was not JSON: %.80s", text)
            return {}
        return {
            "shot_type": out.get("shot_type"),
            "model_present": bool(out.get("model_present")),
            "text_density": out.get("text_density"),
            "on_image_claims": (out.get("on_image_claims") or [])[:6],
            "packaging_style": (out.get("packaging_style") or "")[:120] or None,
            "mood": (out.get("mood") or "")[:60] or None,
            "summary": (out.get("summary") or "")[:300] or None,
            "vision_model": VISION_MODEL,
            "vision_raw": out,
        }
    log.warning("vision gave up after retries")
    return {}


def candidates(client, limit: int | None) -> list[dict]:
    """Tracked products first (they are the ones being compared), then the rest of the focus catalogues."""
    from .signals import key_products
    from .signals_run import catalog_rows, latest_rows

    images: dict[str, str] = {}
    for row in client.table("brand_catalog").select("product_id,image_url").limit(20000).execute().data:
        if row.get("image_url"):
            images.setdefault(row["product_id"], row["image_url"])
    start = 0
    while True:
        page = client.table("product_details").select("product_id,image_url").range(start, start + 999).execute().data
        for row in page:
            if row.get("image_url"):
                images[row["product_id"]] = row["image_url"]
        if len(page) < 1000:
            break
        start += 1000

    tracked = [p["product_id"] for p in key_products(latest_rows(client), catalog_rows(client))]
    ordered = [pid for pid in tracked if pid in images] + [pid for pid in images if pid not in set(tracked)]
    out = [{"product_id": pid, "image_url": images[pid]} for pid in ordered]
    return out[:limit] if limit else out


def run(max_products: int, pixels_only: bool, refresh: bool) -> dict:
    client = connect()
    api_key = None if pixels_only else os.getenv("ANTHROPIC_API_KEY")
    if not pixels_only and not api_key:
        log.warning("ANTHROPIC_API_KEY not set — running the pixel layer only")

    known = {r["product_id"]: r["image_hash"]
             for r in client.table("product_thumbnails").select("product_id,image_hash").limit(20000).execute().data}
    todo = candidates(client, None)
    stats = {"considered": len(todo), "analysed": 0, "unchanged": 0, "errors": 0, "vision": 0}
    rows: list[dict] = []

    with httpx.Client() as http:
        for item in todo:
            if stats["analysed"] >= max_products:
                break
            pid, url = item["product_id"], item["image_url"]
            try:
                data, img = read_image(http, url)
                h = _hash(data)
                if not refresh and known.get(pid) == h:
                    stats["unchanged"] += 1
                    continue
                row = {"product_id": pid, "image_url": url, "image_hash": h, **pixel_features(img)}
                if api_key:
                    v = vision_features(api_key, img)
                    if v:
                        row.update(v)
                        stats["vision"] += 1
                rows.append(row)
                stats["analysed"] += 1
                if len(rows) >= 25:
                    _write(client, rows); rows = []
            except Exception as e:  # noqa: BLE001
                stats["errors"] += 1
                log.warning("thumbnail %s failed: %s", pid, e)
    if rows:
        _write(client, rows)
    log.info("thumbnails: %s", stats)
    return stats


def _write(client, rows: list[dict]) -> None:
    client.table("product_thumbnails").upsert(rows, on_conflict="product_id").execute()
    log.info("wrote %d thumbnails", len(rows))


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--max", type=int, default=MAX_PER_RUN)
    ap.add_argument("--pixels-only", action="store_true", help="skip the vision model (no API key needed)")
    ap.add_argument("--refresh", action="store_true", help="re-analyse even when the image is unchanged")
    args = ap.parse_args()
    logging.basicConfig(level=config.LOG_LEVEL, format="%(asctime)s %(levelname)-7s %(name)s: %(message)s",
                        datefmt="%H:%M:%S", stream=sys.stdout)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    if not os.getenv("SUPABASE_URL"):
        log.error("SUPABASE_URL not set")
        return 2
    run(args.max, args.pixels_only, args.refresh)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
