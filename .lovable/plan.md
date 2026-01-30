
# Switch Copy Generation to Haiku

## Change
Update the AI model in `generate-email-copy-early` from Claude Sonnet 4 to Claude 3.5 Haiku for faster subject line and preview text generation.

## File to Modify

**`supabase/functions/generate-email-copy-early/index.ts`** (line 415)

```typescript
// Before
model: 'claude-sonnet-4-20250514'

// After
model: 'claude-3-5-haiku-20241022'
```

## Rationale
- Subject lines and preview text are short creative tasks (~10-20 words each)
- Haiku handles these well at a fraction of the cost and latency
- The detailed prompt provides strong guardrails for quality

## Expected Improvement
| Metric | Before (Sonnet 4) | After (Haiku) |
|--------|------------------|---------------|
| Latency | ~8-10s | ~2-4s |
| Cost | ~$0.015/call | ~$0.002/call |

This is a safe optimization with no impact on slice processing quality.
