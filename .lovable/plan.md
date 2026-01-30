
# Brand Page Reorganization + Wizard Improvements

## Overview
Fix the Link Preferences wizard to properly allow adding multiple rules, and completely reorganize the brand detail page for a cleaner, less cluttered layout with proper breathing room and visual hierarchy.

---

## Part 1: Fix Wizard "Add Rules" Step

### File: `src/components/brand/LinkPreferencesWizard.tsx`

**Current Problem:** The "+ Add another rule" button only appears when there's already content in the form fields, making it unclear how to add multiple rules.

**Changes:**
1. Always show the "Add another rule" button when the form is filled out (current behavior)
2. Update the logic so when a rule is added successfully, the form clears and shows a clear "+ Add rule" action
3. Make it obvious that users can continue after adding rules

**Lines 475-484** - Update the add rule logic:

```text
Current:
- Button only shows if any field has content
- Confusing flow

New:
- After adding a rule, show summary above + clear form  
- Button always visible: "+ Add rule" or "+ Add another rule" based on context
- Clear "Continue" button to proceed when done adding
```

**Specific Changes:**
- Change button text dynamically: "Add rule" when form is empty, "+ Add another rule" when editing
- Always show the button (not conditionally based on form content)
- Make button full-width and more prominent

---

## Part 2: Reorganize Brand Detail Page

### Current Structure (Cluttered)
```text
BrandDetail.tsx
├── Header (name, domain, actions)
├── BrandSettings.tsx (1779 lines!)
│   ├── Colors (inline)
│   ├── Logos (inline)
│   ├── Typography (inline)
│   ├── Collapsible: Scraped Links
│   ├── Collapsible: Footers
│   ├── Collapsible: ClickUp
│   ├── Collapsible: Klaviyo API
│   ├── Collapsible: Copy Examples
│   ├── Collapsible: Sent Copy
│   └── Collapsible: Link Intelligence
├── Campaigns Section
```

**Problems:**
- Too many collapsible sections crammed together
- No visual grouping or categorization
- BrandSettings is 1779 lines - doing too much
- Link Intelligence buried at the bottom
- No breathing room between sections

### New Structure (Clean Card-Based Layout)

```text
BrandDetail.tsx (redesigned)
├── Header Strip (name, domain, primary color, actions)
│
├── Section: Brand Identity
│   ├── Card: Colors (compact, always visible)
│   └── Card: Logos (2x logos, compact)
│
├── Section: Link Intelligence ← Elevated to its own section
│   ├── Card: Link Preferences (wizard trigger or summary)
│   ├── Card: Sitemap Import Status
│   └── Table: Link Index (collapsible)
│
├── Section: Email Components
│   ├── Card: Footers (grid of footer cards)
│   └── Optional: Typography info
│
├── Section: Integrations ← Grouped together
│   ├── Card: Klaviyo (API key, copy sync)
│   └── Card: ClickUp (list connection)
│
├── Separator
│
└── Section: Campaigns
    └── Grid of campaign cards
```

---

## Part 3: Create New Section Components

### New Files to Create:

**1. `src/components/brand/BrandIdentitySection.tsx`**
- Colors display (compact row with swatches + edit button)
- Logos display (2 logo cards side by side)
- Re-analyze button

**2. `src/components/brand/BrandIntegrationsSection.tsx`**
- Klaviyo API key card
- ClickUp connection card
- Future integrations

**3. `src/components/brand/BrandEmailSection.tsx`**
- Footers grid
- Typography (if relevant)
- Copy Examples / Sent Copy (collapsed by default)

---

## Part 4: Updated BrandDetail.tsx Layout

### New File Structure:

```tsx
export default function BrandDetail() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-8 py-10">
        
        {/* Header */}
        <BrandHeader brand={brand} onDelete={...} onReanalyze={...} />
        
        {/* Brand Identity */}
        <section className="mt-10">
          <h2 className="section-heading">Brand Identity</h2>
          <BrandIdentitySection brand={brand} onBrandChange={...} />
        </section>
        
        {/* Link Intelligence - Prominent Section */}
        <section className="mt-10">
          <h2 className="section-heading">Link Intelligence</h2>
          <LinkIntelligenceSection brandId={brand.id} domain={brand.domain} />
        </section>
        
        {/* Email Components */}
        <section className="mt-10">
          <h2 className="section-heading">Email Components</h2>
          <BrandEmailSection brand={brand} onBrandChange={...} />
        </section>
        
        {/* Integrations */}
        <section className="mt-10">
          <h2 className="section-heading">Integrations</h2>
          <BrandIntegrationsSection brand={brand} onBrandChange={...} />
        </section>
        
        {/* Campaigns */}
        <section className="mt-10 pt-10 border-t">
          <h2 className="section-heading">Campaigns ({count})</h2>
          <CampaignsGrid campaigns={campaigns} brand={brand} />
        </section>
        
      </div>
    </div>
  );
}
```

---

## Part 5: Link Intelligence Section Improvements

### File: `src/components/brand/LinkIntelligenceSection.tsx`

Current: Stats bar + Link Preferences Card + Sitemap Card + Link Table all stacked

**New Layout:**

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  Link Preferences                                          [Edit]       │
│  ──────────────────────────────────────────────────────────────────     │
│                                                                         │
│  Default destination: Main Landing Page ↗                               │
│  2 routing rules configured                                             │
│  Catalog: Small • Updates rarely                                        │
│                                                                         │
│                                                                         │
│  OR (if not configured)                                                 │
│                                                                         │
│  Set up link preferences so Lucy knows where to send traffic            │
│                                          [Set up link preferences →]    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│  Link Index                                              [Import ▼]     │
│  ──────────────────────────────────────────────────────────────────     │
│                                                                         │
│  142 products  •  8 collections  •  All healthy ✓           [+ Add]    │
│                                                                         │
│  ┌───────────────────────────────────────────────────────────────┐     │
│  │  Search links...                                         🔍  │     │
│  └───────────────────────────────────────────────────────────────┘     │
│                                                                         │
│  [Products] [Collections] [All]                                         │
│                                                                         │
│  Table of links...                                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Files Summary

| File | Action |
|------|--------|
| `src/components/brand/LinkPreferencesWizard.tsx` | Fix add rules button visibility |
| `src/pages/BrandDetail.tsx` | Complete redesign with sectioned layout |
| `src/components/dashboard/BrandSettings.tsx` | Extract logic into smaller components (or deprecate) |
| `src/components/brand/BrandIdentitySection.tsx` | NEW - Colors + Logos |
| `src/components/brand/BrandIntegrationsSection.tsx` | NEW - Klaviyo + ClickUp |
| `src/components/brand/BrandEmailSection.tsx` | NEW - Footers + Copy |
| `src/components/brand/LinkIntelligenceSection.tsx` | Update layout for prominence |

---

## Visual Design Principles

1. **Generous spacing** - `mt-10` between major sections, `py-10` for page padding
2. **Card-based layout** - Each distinct feature in its own card
3. **Section headers** - Consistent uppercase small text for section labels
4. **Breathing room** - No cramped collapsibles, everything feels open
5. **Hierarchy** - Link Intelligence gets visual prominence as key feature
6. **Progressive disclosure** - Complex tables collapsed by default, summaries visible

---

## Implementation Order

1. Fix wizard add rules button (quick win)
2. Create new section components
3. Redesign BrandDetail.tsx with new layout
4. Extract functionality from BrandSettings.tsx into new components
5. Clean up / deprecate old BrandSettings if fully replaced
