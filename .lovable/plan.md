

# Emergency: Deploy All 46 Missing Edge Functions

## The Damage

Out of 53 edge functions in this project, **46 are not deployed (404)**. Only the 7 functions that were edited in recent sessions are live. The entire backend is effectively down.

## What Needs to Deploy

Every function listed below is currently returning 404 and needs to be deployed:

### Critical Pipeline (campaign processing)
1. `process-campaign-queue` -- the main orchestrator, campaigns stuck at 0% because of this
2. `detect-brand-from-image`
3. `generate-email-copy-early`
4. `generate-email-copy-background`
5. `generate-email-copy`
6. `qa-spelling-check-early`
7. `qa-spelling-check`
8. `search-clickup-for-copy`
9. `match-slice-to-link`
10. `generate-slice-html`
11. `refine-slice-html`
12. `analyze-slices`

### Footer pipeline
13. `generate-footer-html`
14. `generate-simple-footer`
15. `process-footer-queue`
16. `auto-slice-footer`
17. `analyze-footer-reference`
18. `analyze-footer-render`
19. `detect-footer-links`
20. `detect-footer-region`
21. `detect-footer-socials`
22. `footer-conversation`
23. `refine-footer-html`

### Brand and link intelligence
24. `analyze-brand`
25. `crawl-brand-site`
26. `get-brand-link-index`
27. `add-brand-link`
28. `delete-brand-link`
29. `update-brand-link-preferences`
30. `import-sitemap`
31. `trigger-sitemap-import`
32. `weekly-link-recrawl`
33. `generate-embedding`

### Integrations and utilities
34. `push-to-klaviyo`
35. `scrape-klaviyo-copy`
36. `get-clickup-hierarchy`
37. `fetch-figma-design`
38. `figma-to-email-html`
39. `refine-campaign`
40. `analyze-email-design`
41. `extract-section-assets`
42. `upload-to-cloudinary`
43. `upload-social-icon`
44. `process-brand-logo`
45. `invert-logo`
46. `auto-slice-email`

## The Plan

### Step 1: Batch deploy all 46 functions

Use the direct deployment tool to deploy all 46 at once. If the tool supports batching, do it in one call. If not, batch into groups of 10-12.

### Step 2: If any fail (bundler timeout)

For any function that times out on direct deploy, add a trivial whitespace or comment change to its `index.ts` to trigger the automatic build pipeline. This pattern has already been proven to work with `figma-ingest` and `upload-to-imagekit`.

### Step 3: Verify the critical path

After deployment, confirm these critical functions return non-404:
- `process-campaign-queue` (the main one -- campaigns depend on this)
- `generate-slice-html`
- `detect-brand-from-image`
- `generate-email-copy-early`

### Step 4: Re-trigger the stuck campaign

Call `process-campaign-queue` with:
```text
{ "campaignQueueId": "7c895a11-1866-48ad-9754-cd45697d133d" }
```
to restart the campaign that has been sitting at 0%.

### Step 5: Verify campaign progresses

Check the database row for `7c895a11-1866-48ad-9754-cd45697d133d` to confirm `processing_percent` moves past 0% and `processing_step` advances.

## Files Changed

No code changes to any function. This is a pure deployment operation. If any functions fail to deploy via the direct tool, trivial whitespace edits will be made to force the build pipeline to pick them up.
