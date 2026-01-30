
# Flexible Link Preferences with Conditional Rules

## Overview
Replace the rigid radio-button-based CTA behavior with a flexible system that supports:
- A default destination URL for generic CTAs
- Unlimited conditional rules with keyword matching
- First-match-wins rule evaluation at campaign processing time

---

## Phase 1: Update Type Definitions

### File: `src/types/link-intelligence.ts`

Replace the `BrandLinkPreferences` interface:

```typescript
// Conditional routing rule
export interface LinkRoutingRule {
  id: string;           // UUID for React keys and deletion
  name: string;         // User's label: "Protein campaigns"
  keywords: string[];   // Triggers: ["protein", "whey", "mass gainer"]
  destination_url: string;
}

// Link preferences stored in brands.link_preferences JSONB
export interface BrandLinkPreferences {
  // Default destination for generic CTAs when no rule matches
  default_destination_url?: string;
  default_destination_name?: string;  // Optional friendly label
  
  // Conditional rules - checked in order, first match wins
  rules?: LinkRoutingRule[];
  
  // Catalog characteristics (keep these)
  catalog_size?: 'small' | 'medium' | 'large';
  product_churn?: 'low' | 'medium' | 'high';
  
  // Import tracking (keep these)
  sitemap_url?: string;
  last_sitemap_import_at?: string;
  
  // Legacy fields (for migration compatibility)
  default_cta_behavior?: 'homepage' | 'primary_collection' | 'campaign_context';
  primary_collection_name?: string;
  primary_collection_url?: string;
  onboarding_completed_at?: string;
}
```

---

## Phase 2: Update LinkPreferencesCard Component

### File: `src/components/brand/LinkPreferencesCard.tsx`

Complete rewrite with three sections:

### Section 1: Default Destination
- Name field (optional): Text input for friendly label
- URL field (required): Full URL input

### Section 2: Conditional Rules
- List of rule cards showing: name, keywords (comma-separated), destination URL
- Delete button on each rule
- "+ Add Rule" button at the bottom
- Empty state: "No rules configured"

### Section 3: Catalog Information
- Keep existing dropdowns for catalog_size and product_churn

### Add Rule Modal
New dialog for creating rules with:
- Rule Name (required)
- Keywords (required, comma-separated input)
- Destination URL (required, URL validation)

### Read-Only View Updates
Display:
- Default destination name + URL (or "Not configured")
- Rules count with bullet list of rule names → shortened URLs
- Catalog size + update frequency

### Component State
```typescript
// Form state for editing
const [defaultDestinationUrl, setDefaultDestinationUrl] = useState('');
const [defaultDestinationName, setDefaultDestinationName] = useState('');
const [rules, setRules] = useState<LinkRoutingRule[]>([]);
const [catalogSize, setCatalogSize] = useState<'small' | 'medium' | 'large'>('medium');
const [productChurn, setProductChurn] = useState<'low' | 'medium' | 'high'>('medium');

// Add rule modal state
const [addRuleOpen, setAddRuleOpen] = useState(false);
const [newRuleName, setNewRuleName] = useState('');
const [newRuleKeywords, setNewRuleKeywords] = useState('');
const [newRuleUrl, setNewRuleUrl] = useState('');
```

---

## Phase 3: Migration Logic

### In `LinkPreferencesCard.tsx` - openEdit function

When opening the edit modal, migrate old data structure:

```typescript
const openEdit = () => {
  if (preferences) {
    // Migrate legacy structure if present
    if (preferences.default_cta_behavior && !preferences.default_destination_url) {
      // Old structure detected - migrate
      if (preferences.default_cta_behavior === 'primary_collection' && preferences.primary_collection_url) {
        setDefaultDestinationUrl(preferences.primary_collection_url);
        setDefaultDestinationName(preferences.primary_collection_name || '');
      } else if (preferences.default_cta_behavior === 'homepage') {
        // Will need brand domain - set empty, user can fill in
        setDefaultDestinationUrl('');
        setDefaultDestinationName('Homepage');
      } else {
        // campaign_context - leave empty
        setDefaultDestinationUrl('');
        setDefaultDestinationName('');
      }
    } else {
      // New structure
      setDefaultDestinationUrl(preferences.default_destination_url || '');
      setDefaultDestinationName(preferences.default_destination_name || '');
    }
    
    setRules(preferences.rules || []);
    setCatalogSize(preferences.catalog_size || 'medium');
    setProductChurn(preferences.product_churn || 'medium');
  }
  setEditOpen(true);
};
```

---

## Phase 4: Rule Management Functions

### Add Rule
```typescript
const handleAddRule = () => {
  // Validate
  if (!newRuleName.trim()) {
    toast.error('Rule name is required');
    return;
  }
  const keywords = newRuleKeywords.split(',').map(k => k.trim()).filter(Boolean);
  if (keywords.length === 0) {
    toast.error('At least one keyword is required');
    return;
  }
  if (!newRuleUrl.trim() || !isValidUrl(newRuleUrl)) {
    toast.error('Valid URL is required');
    return;
  }
  
  const newRule: LinkRoutingRule = {
    id: crypto.randomUUID(),
    name: newRuleName.trim(),
    keywords,
    destination_url: newRuleUrl.trim(),
  };
  
  setRules([...rules, newRule]);
  setAddRuleOpen(false);
  resetRuleForm();
};
```

### Delete Rule
```typescript
const handleDeleteRule = (ruleId: string) => {
  setRules(rules.filter(r => r.id !== ruleId));
};
```

### URL Validation Helper
```typescript
const isValidUrl = (url: string) => {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};
```

---

## Phase 5: Save Handler Update

```typescript
const handleSave = async () => {
  try {
    await updatePreferences({
      default_destination_url: defaultDestinationUrl || undefined,
      default_destination_name: defaultDestinationName || undefined,
      rules: rules.length > 0 ? rules : undefined,
      catalog_size: catalogSize,
      product_churn: productChurn,
      // Clear legacy fields
      default_cta_behavior: undefined,
      primary_collection_name: undefined,
      primary_collection_url: undefined,
    });
    toast.success('Link preferences updated');
    setEditOpen(false);
  } catch (error) {
    toast.error('Failed to update preferences');
  }
};
```

---

## Phase 6: Updated UI Layout

### Edit Modal Structure

```text
┌─────────────────────────────────────────────────────────────┐
│ Link Preferences                                      [X]   │
│ Configure where generic CTAs should link                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ DEFAULT DESTINATION                                         │
│ Where generic CTAs link when no rule matches                │
│                                                             │
│ Name (optional)                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Main Landing Page                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ URL                                                         │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ https://eskiin.com/pages/main-lp                        │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ CONDITIONAL RULES (optional)                                │
│ Route specific campaigns to dedicated pages                 │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Protein Campaigns                              [Delete] │ │
│ │ Keywords: protein, whey, mass gainer                    │ │
│ │ → https://store.com/pages/protein-lp                    │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Collagen Campaigns                             [Delete] │ │
│ │ Keywords: collagen, beauty, skin                        │ │
│ │ → https://store.com/pages/collagen-lp                   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ [+ Add Rule]                                                │
│                                                             │
│ ─────────────────────────────────────────────────────────── │
│                                                             │
│ CATALOG INFORMATION                                         │
│                                                             │
│ Catalog Size        Product Updates                         │
│ ┌─────────────────┐ ┌─────────────────┐                     │
│ │ Medium       ▼  │ │ Sometimes    ▼  │                     │
│ └─────────────────┘ └─────────────────┘                     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                               [Cancel]  [Save Preferences]  │
└─────────────────────────────────────────────────────────────┘
```

### Add Rule Dialog

```text
┌─────────────────────────────────────────────────────────────┐
│ Add Routing Rule                                      [X]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Rule Name *                                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ Protein Campaigns                                       │ │
│ └─────────────────────────────────────────────────────────┘ │
│ A label for your reference                                  │
│                                                             │
│ Keywords *                                                  │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ protein, whey, mass gainer                              │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Comma-separated. If any keyword appears in the campaign,    │
│ this rule triggers.                                         │
│                                                             │
│ Destination URL *                                           │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ https://store.com/pages/protein-lp                      │ │
│ └─────────────────────────────────────────────────────────┘ │
│ Where generic CTAs should link for matching campaigns       │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                    [Cancel]  [Add Rule]     │
└─────────────────────────────────────────────────────────────┘
```

---

## Files to Modify

| File | Change |
|------|--------|
| `src/types/link-intelligence.ts` | Add `LinkRoutingRule` interface, update `BrandLinkPreferences` |
| `src/components/brand/LinkPreferencesCard.tsx` | Complete rewrite with new UI structure |

---

## Technical Notes

### Keyword Matching (Future Use)
At campaign processing time, the rules array will be evaluated:
```typescript
function findDestinationUrl(
  campaignContent: string, 
  preferences: BrandLinkPreferences
): string | null {
  const contentLower = campaignContent.toLowerCase();
  
  // Check rules in order - first match wins
  for (const rule of (preferences.rules || [])) {
    const hasMatch = rule.keywords.some(keyword => 
      contentLower.includes(keyword.toLowerCase())
    );
    if (hasMatch) {
      return rule.destination_url;
    }
  }
  
  // Fall back to default destination
  return preferences.default_destination_url || null;
}
```

### Backward Compatibility
- Legacy fields (`default_cta_behavior`, `primary_collection_*`) kept in type for reading old data
- Migration logic converts old structure when editing
- On save, legacy fields are cleared and new structure is written

### URL Validation
- URLs must include protocol (https://)
- Validation using `new URL()` constructor
- Show error toast for invalid URLs
