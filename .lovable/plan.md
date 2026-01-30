

# Simplify Link Preferences to Inline Editor

## Overview
Replace the current card + wizard + modal approach with a simple inline editor. No popups - everything editable directly on the page with a single Save button.

---

## Target Design

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  Link Preferences                                              [Save]  │
│  ───────────────────────────────────────────────────────────────────── │
│                                                                         │
│  General Highlight URL                                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ https://brand.com/pages/main-lp                                 │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│  Product-Specific Links                                                 │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐   │
│  │ Whey Protein                 │  │ https://brand.com/whey       │ ✕ │
│  └──────────────────────────────┘  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐   │
│  │ Collagen                     │  │ https://brand.com/collagen   │ ✕ │
│  └──────────────────────────────┘  └──────────────────────────────┘   │
│  ┌──────────────────────────────┐  ┌──────────────────────────────┐   │
│  │                              │  │                              │   │
│  └──────────────────────────────┘  └──────────────────────────────┘   │
│                                              (empty row for adding)    │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Key Simplifications

| Current | New |
|---------|-----|
| LinkPreferencesCard (summary view) | Removed |
| LinkPreferencesWizard (6-step popup) | Keep for initial onboarding only |
| LinkPreferencesManageView (edit dialog) | Replaced with inline editor |
| Edit/Reconfigure buttons | Single inline form + Save button |

---

## New Component: LinkPreferencesEditor.tsx

A single inline component that replaces both the card summary and the manage modal.

**Features:**
- Direct editing in place (no modal)
- One input for "General Highlight URL"
- Rows for product rules: `[Product Name] [URL] [X]`
- Empty row at bottom for adding new rules
- Single "Save" button (appears when changes detected)
- No wizard trigger needed - user just edits directly

---

## Implementation Details

### File: `src/components/brand/LinkPreferencesEditor.tsx` (NEW)

```tsx
export function LinkPreferencesEditor({ brandId }: { brandId: string }) {
  const { preferences, updatePreferences, isUpdating, isLoading } = useLinkPreferences(brandId);
  
  // Local state for editing
  const [generalUrl, setGeneralUrl] = useState('');
  const [rules, setRules] = useState<Array<{ id: string; name: string; url: string }>>([]);
  const [hasChanges, setHasChanges] = useState(false);
  
  // Sync from preferences on load
  useEffect(() => {
    if (preferences) {
      setGeneralUrl(preferences.default_destination_url || '');
      setRules(preferences.rules?.map(r => ({
        id: r.id,
        name: r.name,
        url: r.destination_url
      })) || []);
    }
  }, [preferences]);
  
  // Track changes
  const updateGeneralUrl = (value: string) => {
    setGeneralUrl(value);
    setHasChanges(true);
  };
  
  const updateRule = (id: string, field: 'name' | 'url', value: string) => {
    setRules(rules.map(r => r.id === id ? { ...r, [field]: value } : r));
    setHasChanges(true);
  };
  
  const addRule = () => {
    setRules([...rules, { id: crypto.randomUUID(), name: '', url: '' }]);
  };
  
  const removeRule = (id: string) => {
    setRules(rules.filter(r => r.id !== id));
    setHasChanges(true);
  };
  
  const handleSave = async () => {
    // Filter out empty rules
    const validRules = rules.filter(r => r.name.trim() && r.url.trim());
    
    await updatePreferences({
      default_destination_url: generalUrl || undefined,
      rules: validRules.map(r => ({
        id: r.id,
        name: r.name.trim(),
        destination_url: r.url.trim()
      }))
    });
    
    setHasChanges(false);
    toast.success('Saved');
  };
  
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Link Preferences</CardTitle>
          {hasChanges && (
            <Button size="sm" onClick={handleSave} disabled={isUpdating}>
              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* General Highlight URL */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            General Highlight URL
          </Label>
          <Input
            placeholder="https://brand.com/pages/main-landing"
            value={generalUrl}
            onChange={(e) => updateGeneralUrl(e.target.value)}
          />
        </div>
        
        {/* Product-Specific Links */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            Product-Specific Links
          </Label>
          <div className="space-y-2">
            {rules.map((rule, index) => (
              <div key={rule.id} className="flex gap-2">
                <Input
                  placeholder="Product name"
                  value={rule.name}
                  onChange={(e) => updateRule(rule.id, 'name', e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="https://..."
                  value={rule.url}
                  onChange={(e) => updateRule(rule.id, 'url', e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRule(rule.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}
            
            {/* Empty row for adding */}
            <div className="flex gap-2">
              <Input
                placeholder="Product name"
                onFocus={addRule}
                className="flex-1"
              />
              <Input
                placeholder="https://..."
                disabled
                className="flex-1"
              />
              <div className="w-9" /> {/* Spacer for alignment */}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
```

---

## Files to Update

| File | Action |
|------|--------|
| `src/components/brand/LinkPreferencesEditor.tsx` | NEW - Simple inline editor |
| `src/components/brand/LinkIntelligenceSection.tsx` | Replace `LinkPreferencesCard` with `LinkPreferencesEditor` |
| `src/components/brand/LinkPreferencesCard.tsx` | DELETE (no longer needed) |
| `src/components/brand/LinkPreferencesManageView.tsx` | DELETE (replaced by inline editor) |
| `src/components/brand/LinkPreferencesWizard.tsx` | KEEP but only used for first-time setup (optional) |

---

## Wizard Handling

The wizard can remain for first-time onboarding if you want a guided experience, but the inline editor becomes the primary way to manage preferences afterward. 

Alternatively, we can remove the wizard entirely and users just fill in the inline form directly.

**Recommendation:** Remove wizard - the inline form is simple enough that no guided setup is needed. Users see empty fields and just fill them in.

---

## Summary

1. Create `LinkPreferencesEditor.tsx` - simple inline form
2. Update `LinkIntelligenceSection.tsx` to use new editor
3. Delete `LinkPreferencesCard.tsx` and `LinkPreferencesManageView.tsx`
4. Optionally remove/keep wizard for first-time users

