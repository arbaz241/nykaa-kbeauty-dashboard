-- 2026-09-27: Nykaa pools reviews across a product's variants — the same review_id is served for
-- sibling listings (e.g. Innisfree Super Volcanic Pore Clay Mask and its Mini). Keyed on review_id
-- alone, whichever listing was crawled last stole the other's reviews. Key on (product_id, review_id)
-- so a pooled review counts for every listing Nykaa shows it under, as Nykaa itself does. Idempotent.
alter table review_texts drop constraint if exists review_texts_pkey;
alter table review_texts add constraint review_texts_pkey primary key (product_id, review_id);
