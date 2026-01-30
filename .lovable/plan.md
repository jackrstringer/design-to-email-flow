
# Simplify Link Routing Rules

## Overview
Simplify the routing rules from a 3-field model (name + keywords + URL) to a 2-field model (product name + preferred URL). The product name itself becomes the matching keyword.

---

## Current vs New Model

| Current | New |
|---------|-----|
| Name: "Protein campaigns" | Product Name: "Whey Protein" |
| Keywords: "protein, whey, mass gainer" | *(dropped - name IS the keyword)* |
| Destination URL: https://... | Preferred URL: https://... |

**New display format:** `Whey Protein → /pages/protein-lp`

---

## Files to Update

### 1. `src/types/link-intelligence.ts`

**Update the `LinkRoutingRule` interface:**

```typescript
// Before
export interface LinkRoutingRule {
  id: string;
  name: string;         // User's label
  keywords: string[];   // Triggers
  destination_url: string;
}

// After
export interface LinkRoutingRule {
  id: string;
  name: string;           // Product/category name (also used for matching)
  destination_url: string;
  keywords?: string[];    // Keep optional for backwards compatibility
}
```

**Update the `findDestinationUrl` helper:**

```typescript
// Match against rule.name instead of keywords
const hasMatch = campaignContent.toLowerCase().includes(rule.name.toLowerCase());
```

---

### 2. `src/components/brand/LinkPreferencesWizard.tsx`

**Changes to add-rules step (lines 412-497):**

- Remove `currentRuleKeywords` state variable
- Remove keywords input field
- Update labels:
  - "What should I call this rule?" → "Product or category name"
  - Remove keywords question entirely
  - "Where should these campaigns link?" → "Preferred URL"
- Update placeholder text:
  - Name: "e.g., Whey Protein" (not "Protein campaigns")
  - URL: "https://store.com/pages/whey-protein"

**Updated form:**
```text
Product or category name
[Whey Protein                    ]

Preferred URL  
[https://store.com/pages/whey    ]

                    [+ Add another]
```

**Summary display:**
```text
✓ Whey Protein → /pages/whey-protein
✓ Collagen → /pages/collagen
```

---

### 3. `src/components/brand/LinkPreferencesManageView.tsx`

**Remove all keyword-related code:**
- Remove `newRuleKeywords` state (line 47)
- Remove `editRuleKeywords` state (line 53)  
- Remove keywords input from add form (lines 326-333)
- Remove keywords input from edit form (lines 246-252)
- Remove "Keywords:" display line (lines 294-296)
- Update validation to only require name + URL

**Update labels:**
- "Rule Name" → "Product/Category Name"
- "Destination URL" → "Preferred URL"

**Updated display for each rule:**
```text
┌─────────────────────────────────────────────┐
│  Whey Protein                    [Edit] [×] │
│  → /pages/whey-protein ↗                    │
└─────────────────────────────────────────────┘
```

---

## State Variable Cleanup

### Wizard
| Remove | Keep |
|--------|------|
| `currentRuleKeywords` | `currentRuleName` |
| | `currentRuleUrl` |

### ManageView
| Remove | Keep |
|--------|------|
| `newRuleKeywords` | `newRuleName` |
| `editRuleKeywords` | `newRuleUrl` |
| | `editRuleName` |
| | `editRuleUrl` |

---

## Validation Updates

**Before:** Required name + at least 1 keyword + valid URL

**After:** Required name + valid URL

---

## Backwards Compatibility

The `keywords` field is made optional in the type. The matching logic checks if `keywords` exists:
- If `keywords` array exists and has items → use keyword matching (legacy data)
- Otherwise → use `name` for matching

```typescript
export function findDestinationUrl(
  campaignContent: string, 
  preferences: BrandLinkPreferences
): string | null {
  const contentLower = campaignContent.toLowerCase();
  
  for (const rule of (preferences.rules || [])) {
    // Use keywords if available (legacy), otherwise match on name
    const hasMatch = rule.keywords && rule.keywords.length > 0
      ? rule.keywords.some(k => contentLower.includes(k.toLowerCase()))
      : contentLower.includes(rule.name.toLowerCase());
    
    if (hasMatch) {
      return rule.destination_url;
    }
  }
  
  return preferences.default_destination_url || null;
}
```

---

## Summary of Changes

| File | Changes |
|------|---------|
| `src/types/link-intelligence.ts` | Make `keywords` optional, update matching logic |
| `src/components/brand/LinkPreferencesWizard.tsx` | Remove keywords field, update labels/placeholders |
| `src/components/brand/LinkPreferencesManageView.tsx` | Remove keywords from add/edit/display, update labels |
