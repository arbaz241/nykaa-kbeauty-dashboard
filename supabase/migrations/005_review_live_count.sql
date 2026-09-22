-- Nykaa's live text-review count, captured with every review fetch (2026-09-22).
-- Used to detect bestsellers whose history is truncated by the ~1,000-review API ceiling.
alter table review_cursor add column if not exists reported_reviews integer;
