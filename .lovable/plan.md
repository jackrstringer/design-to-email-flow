
# Link Preferences Wizard - Lucy the Smart Assistant

## Overview
Create a conversational, step-by-step wizard that guides users through link preferences setup with friendly, first-person copy from "Lucy" - replacing the current form-based UI with a welcoming onboarding experience.

---

## Components to Create

### 1. `LinkPreferencesWizard.tsx`
A modal wizard with 6 steps, smooth transitions, and conversational copy.

**Props:**
```typescript
interface LinkPreferencesWizardProps {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  existingPreferences?: BrandLinkPreferences; // For reconfigure flow
}
```

**State Management:**
```typescript
type WizardStep = 'welcome' | 'default-destination' | 'routing-choice' | 'add-rules' | 'catalog' | 'complete';

const [step, setStep] = useState<WizardStep>('welcome');
const [defaultDestinationUrl, setDefaultDestinationUrl] = useState('');
const [defaultDestinationName, setDefaultDestinationName] = useState('');
const [wantsRules, setWantsRules] = useState<boolean | null>(null);
const [rules, setRules] = useState<LinkRoutingRule[]>([]);
const [catalogSize, setCatalogSize] = useState<'small' | 'medium' | 'large'>('medium');
const [productChurn, setProductChurn] = useState<'low' | 'medium' | 'high'>('medium');
const [isSaving, setIsSaving] = useState(false);

// Current rule being added
const [currentRuleName, setCurrentRuleName] = useState('');
const [currentRuleKeywords, setCurrentRuleKeywords] = useState('');
const [currentRuleUrl, setCurrentRuleUrl] = useState('');
```

**Step Flow:**
```text
welcome → default-destination → routing-choice
                                     ↓
                         ┌───────────┴───────────┐
                         ↓ (No)                  ↓ (Yes)
                      catalog              add-rules → catalog
                         ↓                           ↓
                      complete                   complete
```

**UI Structure per Step:**

| Step | Content |
|------|---------|
| welcome | Lucy intro, "Let's set up your links", ~30 seconds estimate, "Let's go" button |
| default-destination | Question about generic CTA destination, Name + URL inputs |
| routing-choice | Radio: "No, send everything to default" vs "Yes, I have specific destinations" |
| add-rules | Form for rule name, keywords, URL + summary of added rules + "Add another" |
| catalog | Two dropdowns for catalog size and product frequency |
| complete | Summary of what was configured, "Done" button |

**Progress Indicator:**
4 dots at bottom (welcome counts, but add-rules shares step with routing-choice visually)

---

### 2. `LinkPreferencesManageView.tsx`
A streamlined inline/modal view for editing after initial setup.

**Sections:**
- Default Destination: Name + URL fields with inline save
- Rules: List with Edit/Delete per rule, Add Rule button (opens inline form)
- Catalog Info: Two dropdowns with save

**Key difference from wizard:** No conversational framing, just efficient editing. Edit in place without step-by-step flow.

---

## Updates to Existing Components

### 3. Update `LinkPreferencesCard.tsx`

**If configured:** Show summary with two action buttons
- "Edit" → Opens `LinkPreferencesManageView`
- "Reconfigure" → Opens `LinkPreferencesWizard` from step 1

**If not configured:** Show empty state with
- Friendly message: "Not set up yet. I need to know where to send traffic from your campaigns."
- "Set up link preferences →" button → Opens wizard

**Detection Logic:**
```typescript
const isConfigured = Boolean(
  preferences?.default_destination_url || 
  (preferences?.rules && preferences.rules.length > 0)
);
```

---

## Wizard Copy (Lucy's Voice)

### Step 1: Welcome
```text
🔗 Let's set up your links

I'll ask a few quick questions so I know where to send 
traffic from your campaigns.

This takes about 30 seconds.

                                         [Let's go →]
```

### Step 2: Default Destination
```text
When a campaign has a general CTA like "Shop Now"
and isn't highlighting a specific product, where
should I send people?

This is usually your homepage or a main landing page.

Name (optional)
[________________________]

URL
[________________________]

                              [← Back]  [Continue →]
```

### Step 3: Routing Choice
```text
Are there specific products or categories that should
go somewhere other than your default?

For example, some brands send protein campaigns to a
dedicated protein landing page instead of the homepage.

○ No, send everything to my default destination
○ Yes, I have some specific destinations

                              [← Back]  [Continue →]
```

### Step 4: Add Rules (if Yes)
```text
Got it. Let's add your first rule.

What should I call this rule?
[________________________]

What keywords should trigger it?
[________________________]
↳ Comma-separated. If any appear in the campaign, I'll 
  use this destination.

Where should these campaigns link?
[________________________]

{If rules already added, show summary above:}
✓ Protein campaigns → /pages/protein-lp
✓ Collagen campaigns → /pages/collagen-lp

    [+ Add another rule]        [← Back]  [Continue →]
```

### Step 5: Catalog Info
```text
Last thing — tell me a bit about your product catalog.

How many products does this brand have?
[Small — under 50 products              ▼]

How often do you add new products?
[Rarely — mostly the same products      ▼]

                              [← Back]  [Finish →]
```

### Step 6: Complete
```text
✓ You're all set

I'll use these preferences when processing campaigns
for this brand.

Default destination: Main Landing Page
Rules: 2 configured
Catalog: Small • Updates rarely

You can edit these anytime in the Link Intelligence
section of this brand's settings.

                                          [Done]
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/brand/LinkPreferencesWizard.tsx` | Conversational wizard component |
| `src/components/brand/LinkPreferencesManageView.tsx` | Edit view for ongoing management |

## Files to Modify

| File | Change |
|------|---------|
| `src/components/brand/LinkPreferencesCard.tsx` | Update to show configured/unconfigured states, add Edit + Reconfigure buttons, trigger wizard |
| `src/components/brand/LinkIntelligenceSection.tsx` | Pass additional props if needed |

---

## Technical Implementation Details

### Wizard Transitions
Use CSS transitions for smooth step changes:
```typescript
className={cn(
  "transition-all duration-300 ease-in-out",
  isCurrentStep ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4 absolute"
)}
```

### Save Logic
On "Finish" in catalog step, save all preferences at once:
```typescript
const handleFinish = async () => {
  setIsSaving(true);
  try {
    await updatePreferences({
      default_destination_url: defaultDestinationUrl || undefined,
      default_destination_name: defaultDestinationName || undefined,
      rules: rules.length > 0 ? rules : undefined,
      catalog_size: catalogSize,
      product_churn: productChurn,
    });
    setStep('complete');
  } catch (error) {
    toast.error('Failed to save preferences');
  } finally {
    setIsSaving(false);
  }
};
```

### Rule Management in Wizard
When clicking "+ Add another rule":
1. Validate current inputs
2. Add to `rules` array
3. Clear form fields for next rule
4. Show summary of added rules above the form

### Progress Dots
```typescript
const stepIndex = {
  'welcome': 0,
  'default-destination': 1,
  'routing-choice': 2,
  'add-rules': 2,  // Same dot as routing-choice
  'catalog': 3,
  'complete': 3,   // Same dot as catalog (completion state)
};

const totalDots = 4;
```

### Modal Styling
- Max width: 500px (as specified)
- Clean white background
- Centered content with generous padding
- No heavy headers - content speaks for itself

---

## Integration Points

### Triggering the Wizard
1. **From LinkPreferencesCard** (not configured): Click "Set up link preferences →"
2. **From LinkPreferencesCard** (configured): Click "Reconfigure"
3. **Future: From BrandOnboardingModal**: Add as a step after ClickUp, before Footer

### After Wizard Completes
1. Close modal
2. Refetch preferences (via query invalidation)
3. Card updates to show configured state

---

## Validation Rules

| Field | Validation |
|-------|------------|
| Default URL | Required, must be valid URL with protocol |
| Rule name | Required (when adding a rule) |
| Rule keywords | Required, at least one keyword |
| Rule URL | Required, valid URL with protocol |
| Catalog size | Required (has default) |
| Product churn | Required (has default) |
