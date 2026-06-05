# AI Model Audit & Migration — June 2026

## Why this matters now

Three problems are hiding in the current AI stack:

1. **`claude-3-5-haiku-20241022` was retired Feb 19, 2026.** Every call to it has been silently failing for months. Used in `qa-spelling-check-early`, `analyze-slices` (matcher path), and `match-slice-to-link`.
2. **`claude-sonnet-4-20250514` and `claude-opus-4-20250514` retire June 15, 2026 — 14 days from now.** Used in 8+ functions including `generate-email-copy`, `qa-spelling-check`, `detect-brand-from-image`, `detect-footer-socials`, `detect-footer-links`, `extract-section-assets`, `auto-slice-email`.
3. **`claude-opus-4-1-20250805` is legacy pricing ($15/$75 per MTok)** — currently in `generate-footer-html`, `generate-simple-footer`, `refine-footer-html`, `refine-campaign`, `analyze-email-design`, `figma-to-email-html`, `footer-conversation`. The current Opus 4.8 is ~67% cheaper with materially better capability.

## Current model lineup (verified June 1, 2026)

| Model | Price (in/out per MTok) | Context | Best for |
|---|---|---|---|
| `claude-opus-4-8` | $5 / $25 | 1M | Spatial reasoning on hi-res images (new 2576px encoder), complex HTML, design analysis |
| `claude-sonnet-4-6` | $3 / $15 | 1M | Copy generation, brand detection, footer detection — direct replacement for Sonnet 4 |
| `claude-haiku-4-5-20251001` | $1 / $5 | 200K | Spell QA, list-based link matching — 2× speed of Sonnet 4 at ⅓ cost |
| `google/gemini-3.5-flash` | (via Lovable AI Gateway) | 1M | Replacement for `gemini-2.5-flash` — 4× faster, better agentic/coding |
| `google/gemini-3.1-flash-lite-preview` | (cheapest) | — | Replacement for `gemini-2.5-flash-lite` — ClickUp extraction |

**Breaking change on Opus 4.7/4.8:** these models reject non-default `temperature`, `top_p`, `top_k`, and manual `thinking.budget_tokens`. Those parameters must be removed from every Opus call site. Use `thinking: { type: "adaptive" }` instead.

## Phase 1 — Mandatory model swaps (stops production failures)

22 edge functions, string swaps + param scrubs for Opus calls.

| Edge function | Change |
|---|---|
| `qa-spelling-check-early` | `claude-3-5-haiku-20241022` → `claude-haiku-4-5-20251001` |
| `qa-spelling-check` | `claude-sonnet-4-20250514` → `claude-haiku-4-5-20251001` (downgrade — typo QA doesn't need Sonnet) |
| `match-slice-to-link` (2 calls) | `claude-3-5-haiku-20241022` → `claude-haiku-4-5-20251001` |
| `analyze-slices` (2 calls) | `claude-3-5-haiku-20241022` → `claude-haiku-4-5-20251001` |
| `generate-email-copy` | `claude-sonnet-4-20250514` → `claude-sonnet-4-6` |
| `generate-email-copy-early` | `claude-sonnet-4-20250514` → `claude-sonnet-4-6` |
| `detect-brand-from-image` | `claude-sonnet-4-20250514` → `claude-sonnet-4-6` |
| `detect-footer-socials` (2 calls) | `claude-sonnet-4-20250514` → `claude-sonnet-4-6` |
| `detect-footer-links` (2 calls) | `claude-sonnet-4-20250514` → `claude-sonnet-4-6` |
| `extract-section-assets` | `claude-sonnet-4-20250514` → `claude-sonnet-4-6` |
| `auto-slice-email` | `claude-sonnet-4-20250514` → `claude-sonnet-4-6` |
| `auto-slice-v2` | `claude-sonnet-4-5` → **`claude-opus-4-7`** (hi-res 2576px image encoder — biggest quality win in the pipeline) |
| `analyze-email-design` | `claude-opus-4-1-20250805` → `claude-opus-4-8` + scrub params |
| `figma-to-email-html` (2 calls) | `claude-opus-4-1-20250805` → `claude-opus-4-8` + scrub params |
| `generate-footer-html` (3 calls) | `claude-opus-4-1-20250805` → `claude-opus-4-8` + scrub params |
| `generate-simple-footer` | `claude-opus-4-1-20250805` → `claude-opus-4-8` + scrub params |
| `refine-footer-html` | `claude-opus-4-1-20250805` → `claude-opus-4-8` + scrub params |
| `refine-campaign` | `claude-opus-4-1-20250805` → `claude-opus-4-8` + scrub params |
| `footer-conversation` | `claude-opus-4-1-20250805` → `claude-opus-4-8` + scrub params |
| `detect-footer-region` | `google/gemini-2.5-flash` → `google/gemini-3.5-flash` |
| `generate-slice-html` (3 calls) | `google/gemini-2.5-flash` → `google/gemini-3.5-flash` |
| `refine-slice-html` | `google/gemini-2.5-flash` → `google/gemini-3.5-flash` |
| `search-clickup-for-copy` | `google/gemini-2.5-flash-lite` → `google/gemini-3.1-flash-lite-preview` |

## Phase 2 — Streamlining wins from new platform features

These actually shrink the pipeline, not just swap names.

1. **Auto prompt caching** on `auto-slice-v2`, `generate-email-copy*`, `refine-campaign`, `footer-conversation`. Add `cache_control: { type: "ephemeral" }` at the top of long system prompts + the 1000-link brand index. Cache reads are **0.1× price (90% off)** — the brand index is currently re-sent on every slice/copy call.
2. **Adaptive thinking** (`thinking: { type: "adaptive" }`) on `auto-slice-v2` and `analyze-email-design`. Replaces our implicit "always think hard" prompting — model decides per-image, cutting latency on simple emails.
3. **Anthropic Files API** for the campaign image. Today every parallel call (`generate-email-copy-early`, `qa-spelling-check-early`, `auto-slice-v2`, `search-clickup-for-copy`) re-receives the image as base64. Upload once, reference by file_id everywhere — removes the multi-MB payload from 3 of 4 calls and eliminates the MIME-type bug class entirely (the same class of bug that caused the 65% stall last week).
4. **Structured outputs (GA)** in copy/QA/footer-detect functions. Replaces our regex `match(/\{[\s\S]*\}/)` parsing with `output_config.format: { type: "json_schema", schema: {...} }`. Guaranteed valid JSON, zero parse failures, kills the fallback paths.
5. **Advisor tool** (`advisor-tool-2026-03-01` beta header) on `auto-slice-v2`. Pair Haiku 4.5 as executor with Opus 4.8 as advisor — near-Opus quality at Haiku speed. Realistic target: cut slice-stage from ~20s to under 10s.
6. **`thinking.display: "omitted"`** on streaming Opus calls in `footer-conversation` and `refine-campaign` — faster time-to-first-token, same billing.
7. **Sonnet 4.6's 1M context** lets us drop the slice-window chunking in `analyze-slices` — pass the full email plus brand context in one call.

## Phase 3 — Deferred / optional

- **Fast Mode** on Opus 4.8 (2.5× throughput) for `generate-footer-html` and `figma-to-email-html` — needs claude.com/fast-mode waitlist approval; worth applying for now.
- **Managed Agents** (`managed-agents-2026-04-01`) could replace `process-campaign-queue`'s hand-rolled orchestration — bigger rewrite, out of scope for this plan.
- **Gemini 3.1 Pro** — still in preview; reassess at GA.

## Expected impact

- **Reliability:** zero retired-model failures; eliminates the silent Haiku-3.5 errors and prevents the June 15 retirement hard-stop.
- **Cost:** Opus 4.1 → 4.8 cuts ~67% across the most expensive call sites (HTML/footer generation). Auto-prompt-caching cuts repeated brand-context tokens by 90%.
- **Speed:** Haiku 4.5 ~2× faster than Sonnet 4 for QA. Gemini 3.5 Flash ~4× faster than 2.5. Advisor tool roughly halves slicing latency.
- **Quality:** Opus 4.7/4.8 hi-res encoder (2576px vs Sonnet's 1568px) is the single biggest accuracy win for `auto-slice-v2` on tall, text-dense email images.

## Scope

All changes live inside `supabase/functions/`. No DB, no client, no schema, no business-logic changes. 22 files in Phase 1; ~8 of those touched again in Phase 2.

## Verification after each phase

- Phase 1: deploy → run one test campaign through `process-campaign-queue` → check `supabase--edge_function_logs` for 4xx/5xx and confirm `pipeline_metrics` durations look normal.
- Phase 2: same test campaign + compare `pipeline_metrics` against the Phase 1 baseline for slicing/copy/QA timings.
