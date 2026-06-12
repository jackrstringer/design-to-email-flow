-- Per-campaign footer override (Flyout Footer Studio).
--
-- "Use for this campaign" in the footer studio attaches a one-off footer to a
-- single campaign_queue row without touching the brand's saved footers:
--   - footer_override_html:   the compiled email HTML actually pushed to Klaviyo
--   - footer_override_state:  the structured representation (FooterDoc: either
--     { kind:'image', slices, legalSection } matching brand_footers.image_slices
--     semantics, or { kind:'html', html }) so reopening the studio restores the
--     editable state, not just flat HTML.
--
-- "Save as version" keeps using brand_footers (new row per version; is_primary
-- remains the active-footer semantic via the existing unique partial index),
-- so no brand_footers schema change is needed.

ALTER TABLE public.campaign_queue
  ADD COLUMN IF NOT EXISTS footer_override_html text,
  ADD COLUMN IF NOT EXISTS footer_override_state jsonb;

COMMENT ON COLUMN public.campaign_queue.footer_override_html IS
  'One-off footer HTML for this campaign only (set by the footer studio "Use for this campaign"). Takes precedence over the brand footer at push time.';
COMMENT ON COLUMN public.campaign_queue.footer_override_state IS
  'Structured footer-studio state behind footer_override_html ({kind:"image",slices,legalSection} or {kind:"html",html}) so the override stays editable.';
