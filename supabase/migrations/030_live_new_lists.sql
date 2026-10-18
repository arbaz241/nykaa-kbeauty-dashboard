-- 030 (owner 18 Oct 2026: round 4 goes live): undo 027. The live site now runs the round 4 code, which handles
-- the lists added on 18 Oct (BB & CC cream, blush, lip gloss), so the live views include them again.

create or replace view web_brand_daily with (security_invoker = true) as
 SELECT s.scrape_date,
    p.brand,
    COALESCE(b.origin, 'unknown'::text) AS origin,
    s.subcategory,
    count(*) AS slots,
    min(s.rank) AS best_rank,
    count(*) FILTER (WHERE s.rank <= 20) AS top20
   FROM scrape_snapshots s
     JOIN products p USING (product_id)
     LEFT JOIN brand_classification b ON b.brand = p.brand
  GROUP BY s.scrape_date, p.brand, (COALESCE(b.origin, 'unknown'::text)), s.subcategory;

create or replace view web_brand_shares with (security_invoker = true) as
 WITH shelf AS (
         SELECT s.scrape_date,
            p.brand,
            count(*)::integer AS slots,
            count(*) FILTER (WHERE s.rank <= 20)::integer AS top20,
            min(s.rank) AS best_rank
           FROM scrape_snapshots s
             JOIN products p USING (product_id)
          WHERE s.subcategory <> 'kbeauty_store'::text
          GROUP BY s.scrape_date, p.brand
        ), shelf_total AS (
         SELECT shelf.scrape_date,
            sum(shelf.slots)::integer AS total
           FROM shelf
          GROUP BY shelf.scrape_date
        ), voice AS (
         SELECT search_snapshots.scrape_date,
            search_snapshots.brand,
            count(*) FILTER (WHERE NOT search_snapshots.is_ad)::integer AS earned,
            count(*) FILTER (WHERE search_snapshots.is_ad)::integer AS paid
           FROM search_snapshots
          GROUP BY search_snapshots.scrape_date, search_snapshots.brand
        ), voice_total AS (
         SELECT voice.scrape_date,
            sum(voice.earned)::integer AS total
           FROM voice
          GROUP BY voice.scrape_date
        )
 SELECT COALESCE(sh.scrape_date, v.scrape_date) AS scrape_date,
    COALESCE(sh.brand, v.brand) AS brand,
    COALESCE(b.origin, 'unknown'::text) AS origin,
    COALESCE(sh.slots, 0) AS slots,
    COALESCE(sh.top20, 0) AS top20,
    sh.best_rank,
    round(COALESCE(sh.slots, 0)::numeric / NULLIF(st.total, 0)::numeric, 4) AS share_of_shelf,
    COALESCE(v.earned, 0) AS search_earned,
    COALESCE(v.paid, 0) AS search_paid,
    round(COALESCE(v.earned, 0)::numeric / NULLIF(vt.total, 0)::numeric, 4) AS share_of_voice,
    round(COALESCE(v.paid, 0)::numeric / NULLIF(COALESCE(v.earned, 0) + COALESCE(v.paid, 0), 0)::numeric, 3) AS paid_dependency
   FROM shelf sh
     FULL JOIN voice v ON v.scrape_date = sh.scrape_date AND v.brand = sh.brand
     LEFT JOIN shelf_total st ON st.scrape_date = COALESCE(sh.scrape_date, v.scrape_date)
     LEFT JOIN voice_total vt ON vt.scrape_date = COALESCE(sh.scrape_date, v.scrape_date)
     LEFT JOIN brand_classification b ON b.brand = COALESCE(sh.brand, v.brand);

create or replace view web_category_coverage with (security_invoker = true) as
 SELECT subcategory AS category,
    min(scrape_date) AS first_date,
    max(scrape_date) AS last_date,
    count(DISTINCT scrape_date)::integer AS days_tracked
   FROM scrape_snapshots
  GROUP BY subcategory;

create or replace view web_latest_shelf with (security_invoker = true) as
 SELECT v.scrape_date,
    v.subcategory,
    v.rank,
    v.product_id,
    v.name,
    v.brand,
    v.origin,
    v.k_marketing,
    v.mrp,
    v.price,
    v.discount_pct,
    v.rating,
    v.rating_count,
    v.in_stock,
    v.is_ad,
    v.is_pinned,
    v.has_offer,
    v.offer_message,
    v.url,
    v.first_review_date,
    v.review_count,
    p.pack_size,
    d.country_name,
    d.formulation,
    d.skin_types,
    d.concerns,
    d.key_ingredients,
    d.preferences,
    d.usp_summary,
    d.usp_points,
    d.review_key_phrases,
    d.review_splitup,
    d.review_count AS detail_review_count,
    d.image_url,
    d.description_text,
    v.is_bestseller,
    v.is_new_tag,
    v.tags,
    v.nykaa_l3
   FROM v_snapshots v
     JOIN products p USING (product_id)
     LEFT JOIN product_details d USING (product_id)
  WHERE v.scrape_date = (( SELECT max(scrape_snapshots.scrape_date) AS max
           FROM scrape_snapshots));

create or replace view web_movement with (security_invoker = true) as
 WITH days AS (
         SELECT max(scrape_snapshots.scrape_date) AS today
           FROM scrape_snapshots
        ), snap AS (
         SELECT s.product_id,
            s.subcategory,
            s.scrape_date,
            s.rank,
            s.price,
            s.mrp,
            s.is_ad,
            s.discount_pct
           FROM scrape_snapshots s
          WHERE s.subcategory <> 'kbeauty_store'::text
        )
 SELECT n.product_id,
    p.brand,
    COALESCE(b.origin, 'unknown'::text) AS origin,
    d.name,
    d.url,
    n.subcategory AS category,
    n.rank,
    n.price,
    n.mrp,
    n.is_ad,
    n.discount_pct,
    w.rank AS rank_7d,
    f.rank AS rank_14d,
    w.rank - n.rank AS gain_7d,
    f.rank - n.rank AS gain_14d,
    w.price AS price_7d,
    f.price AS price_14d,
    f.mrp AS mrp_14d,
    f.mrp IS NOT NULL AND n.mrp = f.mrp AS same_pack,
        CASE
            WHEN f.price > 0::numeric AND n.mrp = f.mrp THEN round((n.price - f.price) / f.price, 3)
            ELSE NULL::numeric
        END AS price_change_14d,
        CASE
            WHEN f.mrp IS NOT NULL AND n.mrp <> f.mrp THEN true
            ELSE false
        END AS pack_changed_14d,
    round(n.discount_pct - f.discount_pct, 1) AS discount_change_14d,
    f.product_id IS NULL AS new_since_14d
   FROM snap n
     CROSS JOIN days dd
     LEFT JOIN snap w ON w.product_id = n.product_id AND w.subcategory = n.subcategory AND w.scrape_date = (dd.today - 7)
     LEFT JOIN snap f ON f.product_id = n.product_id AND f.subcategory = n.subcategory AND f.scrape_date = (dd.today - 14)
     JOIN product_dim d ON d.product_id = n.product_id
     JOIN products p ON p.product_id = n.product_id
     LEFT JOIN brand_classification b ON b.brand = p.brand
  WHERE n.scrape_date = dd.today;

create or replace view web_product_history with (security_invoker = true) as
 SELECT scrape_date,
    subcategory,
    product_id,
    rank,
    price,
    mrp,
    discount_pct,
    rating,
    rating_count,
    is_ad,
    is_pinned,
    has_offer
   FROM scrape_snapshots;

create or replace view web_share_daily with (security_invoker = true) as
 SELECT s.scrape_date,
    s.subcategory,
    COALESCE(b.origin, 'unknown'::text) AS origin,
    count(*) AS slots,
    count(*) FILTER (WHERE s.rank <= 20) AS top20
   FROM scrape_snapshots s
     JOIN products p USING (product_id)
     LEFT JOIN brand_classification b ON b.brand = p.brand
  WHERE s.subcategory <> 'kbeauty_store'::text
  GROUP BY s.scrape_date, s.subcategory, (COALESCE(b.origin, 'unknown'::text));

select public.refresh_web_snapshots();

notify pgrst, 'reload schema';
