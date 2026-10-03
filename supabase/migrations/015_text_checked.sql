-- 015: remember which products the review-text catch-up has already walked.
-- The catch-up fetches text for products whose monthly counts were collected before text capture began
-- (16-23 Sep). A product with no written reviews in the text window stays "missing text" forever, so without
-- this it was re-walked every night (12 such products on 3 Oct). Reviews that arrive later are captured
-- with their text by the regular review-history pass, so one walk is enough.
alter table review_cursor add column if not exists text_checked_at timestamptz;
