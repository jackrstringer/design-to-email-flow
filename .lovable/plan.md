

# Update Routing Choice Step Copy

## Overview
Update the copy on the routing-choice step to be clearer and less confusing. The current text "send everything to my default destination" sounds like everything goes to one place, which isn't the intended meaning.

---

## Changes

### File: `src/components/brand/LinkPreferencesWizard.tsx`

**Lines 361-394** - Update the routing-choice step content:

**Current:**
```text
Are there specific products or categories that should
go somewhere other than your default?

For example, some brands send protein campaigns to a
dedicated protein landing page instead of the homepage.

○ No, send everything to my default destination
○ Yes, I have some specific destinations
```

**New:**
```text
Are there specific products or categories that should 
lead somewhere specific?

For instance, maybe you have some products with dedicated 
landing pages you'd like to always send to, instead of 
the site product page.

○ No, normal destinations are fine
○ Yes, I have some preferences
```

---

## Summary

| Element | Before | After |
|---------|--------|-------|
| Question | "go somewhere other than your default?" | "lead somewhere specific?" |
| Helper text | "protein campaigns to a dedicated protein landing page instead of the homepage" | "products with dedicated landing pages you'd like to always send to, instead of the site product page" |
| No option | "No, send everything to my default destination" | "No, normal destinations are fine" |
| Yes option | "Yes, I have some specific destinations" | "Yes, I have some preferences" |

