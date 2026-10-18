// Nightly data files for the site (owner 19 Oct 2026: pages must open in 0.1-0.2 s). The ready-made copies the pages
// read (web_blobs, rebuilt by the scraper's nightly refresh) are written as files next to the site, so Cloudflare
// serves them from its own servers in one round trip, instead of the browser waiting on four database calls first
// (settings, guest sign-in, brand tiers, then a 3-4 s bundle request).
//
// Only while the site is open to anyone with the link (app_settings.require_login = false): the files carry the same
// data a guest sees. With sign-in required, nothing is written and the pages read the database as before.
//
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/export-data.mjs
//
// Writes public/data/<stamp>/<name>.json and public/data/manifest.json (read by next.config.ts at build time).
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "data");
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
rmSync(OUT, { recursive: true, force: true });
if (!url || !key) { console.log("export-data: no Supabase service key, no data files (pages read the database)"); process.exit(0); }

async function get(path) {
  const r = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}`, "Accept-Encoding": "gzip" } });
  if (!r.ok) throw new Error(`${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

// every row of a bigger table (the API answers at most 1,000 rows per request)
async function getAll(path) {
  const out = [];
  for (let from = 0; ; from += 1000) { const rows = await get(`${path}&offset=${from}&limit=1000`); out.push(...rows); if (rows.length < 1000) return out; }
}

const setting = await get("app_settings?select=value&key=eq.require_login");
if (!setting.length || setting[0].value !== false) { console.log("export-data: sign-in is required, no data files"); process.exit(0); }

const blobs = await get("web_blobs?select=view,body,built_at");
// small tables the pages read whole, without who edited them (updated_by / created_by can be an email address)
const tables = {
  brand_tiers: await get("brand_tiers?select=brand,tier,grp,sort,note&order=sort"),
  market_events: await get("market_events?select=id,happened_on,ends_on,label,kind,brand,note,created_at,source,status&order=happened_on.desc"),
  data_notes: await get("data_notes?select=id,starts_on,ends_on,kind,scope,brand,category,title,detail,status,created_at&order=starts_on"),
};
// the Korean dictionary exists only once migration 024 is applied; until then the Korean site shows data text in English
try { const ko = await getAll("ko_dictionary?select=en,ko&order=en"); if (ko.length) tables.ko_dictionary = ko; } catch { /* not there yet */ }

const newest = blobs.reduce((a, b) => (b.built_at > a ? b.built_at : a), "");
const stamp = newest.replace(/[^0-9]/g, "").slice(0, 14) || String(Date.now());
const dir = join(OUT, stamp);
mkdirSync(dir, { recursive: true });
let bytes = 0;
const write = (name, doc) => { const s = JSON.stringify(doc); bytes += s.length; writeFileSync(join(dir, `${name}.json`), s); };
for (const b of blobs) write(b.view, b.body);
for (const [name, rows] of Object.entries(tables)) write(name, rows);
const manifest = { stamp, built: Object.fromEntries(blobs.map((b) => [b.view, b.built_at])), tables: Object.keys(tables), exported: new Date().toISOString() };
writeFileSync(join(OUT, "manifest.json"), JSON.stringify(manifest));
console.log(`export-data: ${blobs.length} copies + ${Object.keys(tables).length} tables, ${(bytes / 1e6).toFixed(1)} MB, stamp ${stamp}`);
