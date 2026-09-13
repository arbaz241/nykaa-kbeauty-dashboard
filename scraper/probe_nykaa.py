"""Phase 1 feasibility probe.

Loads a Nykaa category listing page in headless Chromium, intercepts every
network response, and reports which requests return JSON that looks like
product listing data. Also records block signals (403/429, captcha pages).
Writes a JSON report to the scratch dir given as argv[1].
"""
import asyncio, json, sys, time
from pathlib import Path
from playwright.async_api import async_playwright

URLS = {
    "moisturizer": "https://www.nykaa.com/skin/moisturizers/c/8394",
    "serum": "https://www.nykaa.com/skin/face-serums/c/8395",
}
UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36")

async def probe(url, out_dir):
    hits = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, channel="chromium")
        ctx = await browser.new_context(user_agent=UA, locale="en-IN",
                                        viewport={"width": 1366, "height": 900})
        page = await ctx.new_page()

        async def on_response(resp):
            try:
                ct = resp.headers.get("content-type", "")
                rec = {"url": resp.url, "status": resp.status, "ct": ct,
                       "type": resp.request.resource_type}
                if "json" in ct and resp.status == 200:
                    body = await resp.text()
                    rec["len"] = len(body)
                    low = body.lower()
                    rec["looks_like_products"] = any(k in low for k in
                        ('"products"', '"productid"', '"mrp"', '"rating"'))
                    if rec["looks_like_products"] and len(body) > 5000:
                        fn = out_dir / f"body_{len(hits)}.json"
                        fn.write_text(body)
                        rec["saved"] = str(fn)
                hits.append(rec)
            except Exception as e:
                hits.append({"url": resp.url, "err": repr(e)})

        page.on("response", on_response)
        t0 = time.time()
        resp = await page.goto(url, wait_until="domcontentloaded", timeout=60000)
        await page.wait_for_timeout(6000)
        html = await page.content()
        title = await page.title()
        # Try scrolling to trigger pagination / lazy loads
        for _ in range(3):
            await page.mouse.wheel(0, 2500)
            await page.wait_for_timeout(1500)
        (out_dir / "page.html").write_text(html)
        await page.screenshot(path=str(out_dir / "page.png"), full_page=False)
        summary = {
            "url": url, "status": resp.status if resp else None,
            "final_url": page.url, "title": title, "elapsed": round(time.time()-t0, 1),
            "html_len": len(html),
            "block_signals": [s for s in ("captcha", "access denied", "akamai",
                              "cloudflare", "unusual traffic", "blocked")
                              if s in html.lower()],
            "has_next_data": "__NEXT_DATA__" in html or "__PRELOADED_STATE__" in html
                             or "window.__INITIAL_STATE__" in html,
            "cookies": [c["name"] for c in await ctx.cookies()],
        }
        await browser.close()
    return summary, hits

async def main():
    out_root = Path(sys.argv[1]); out_root.mkdir(parents=True, exist_ok=True)
    report = {}
    for name, url in URLS.items():
        d = out_root / name; d.mkdir(exist_ok=True)
        summary, hits = await probe(url, d)
        json_hits = [h for h in hits if "json" in h.get("ct", "")]
        report[name] = {"summary": summary, "json_responses": json_hits,
                        "status_counts": {}}
        for h in hits:
            s = str(h.get("status")); report[name]["status_counts"][s] = \
                report[name]["status_counts"].get(s, 0) + 1
        await asyncio.sleep(3)
    (out_root / "report.json").write_text(json.dumps(report, indent=2))
    for name, r in report.items():
        print(f"== {name}: {r['summary']}")
        print("   status counts:", r["status_counts"])
        for h in r["json_responses"]:
            print(f"   JSON {h['status']} {h.get('len','?'):>7} prod={h.get('looks_like_products')} {h['url'][:160]}")

asyncio.run(main())
