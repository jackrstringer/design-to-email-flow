

# Add Inline-Editable Legal Section to Image Footer Studio

## Summary

Restore the ability to edit the footer fine print (legal section) with a compact, inline-editing experience similar to Klaviyo's drag-and-drop text blocks. Users can click directly on the legal text to edit it, with live HTML conversion.

## Current Problem

The previous `LegalContentEditor` component was removed from the page, and the legal section only shows a read-only preview. Users cannot edit the fine print content, colors, or settings.

## Solution: Inline WYSIWYG Editing

Replace the static legal section preview with a compact, inline-editable block:

1. **Click to edit** - Clicking the legal section enables editing mode directly in the preview
2. **Live HTML conversion** - Text changes convert to HTML in real-time
3. **Compact floating toolbar** - Small toolbar appears on focus with essential controls:
   - Text/background color pickers
   - Alignment buttons
   - Quick-insert buttons for Klaviyo merge tags
4. **Compliance indicators** - Inline badges show if required tags are missing

## UI Design

```text
┌─────────────────────────────────────────────────────────────────────┐
│  [Image Slices]                                                     │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │ ▾ Floating Toolbar (appears on focus)                       │    │
│  │ [🎨 BG] [🎨 Text] [◀ ▢ ▶] [+ Org] [+ Addr] [+ Unsub]        │    │
│  └─────────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                                                              │   │
│  │     Acme Inc. | 123 Main St, City, ST 12345                 │   │
│  │                                                              │   │
│  │        Unsubscribe | Manage Preferences                      │   │
│  │                                                              │   │
│  │  [Click anywhere to edit - contenteditable div]             │   │
│  └─────────────────────────────────────────────────────────────┘    │
│  [Missing: Org Name ⚠] [Missing: Address ⚠] (if not compliant)     │
└─────────────────────────────────────────────────────────────────────┘
```

## Implementation

### New Component: `InlineLegalEditor.tsx`

Create a compact inline editor component that:
- Renders a `contentEditable` div styled to match the legal section
- Shows a floating toolbar on focus with color pickers and merge tag buttons
- Converts user input to HTML on blur/change
- Validates compliance and shows inline warning badges

```typescript
interface InlineLegalEditorProps {
  legalSection: LegalSectionData;
  onUpdate: (updates: Partial<LegalSectionData>) => void;
  width: number;
}
```

### Key Features

1. **ContentEditable div** - Directly edit the text in the preview
2. **Floating toolbar** - Appears above the section when focused:
   - Color pickers for background/text (compact square buttons)
   - Alignment toggle (left/center/right)
   - Insert buttons for `{{ organization.name }}`, `{{ organization.address }}`, `{% unsubscribe_url %}`
3. **HTML extraction** - On blur, extract innerHTML and update `legalSection.content`
4. **Merge tag placeholders** - Render merge tags as styled chips/badges in the editor
5. **Compliance badges** - Show small warning badges if required tags are missing

### ImageFooterStudio Changes

Replace the static legal preview (lines 598-628) with the new `InlineLegalEditor`:

```tsx
{/* Legal Section - Inline Editable */}
{legalSection && (
  <InlineLegalEditor
    legalSection={legalSection}
    onUpdate={handleLegalUpdate}
    width={scaledWidth}
  />
)}
```

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/footer/InlineLegalEditor.tsx` | Create | New inline contentEditable editor with floating toolbar |
| `src/pages/ImageFooterStudio.tsx` | Modify | Import and use InlineLegalEditor instead of static preview |

## Technical Details

### ContentEditable Approach

```tsx
const [isEditing, setIsEditing] = useState(false);
const editorRef = useRef<HTMLDivElement>(null);

// Render with contentEditable
<div
  ref={editorRef}
  contentEditable={isEditing}
  suppressContentEditableWarning
  onFocus={() => setIsEditing(true)}
  onBlur={handleBlur}
  onClick={() => setIsEditing(true)}
  dangerouslySetInnerHTML={{ __html: displayContent }}
  style={{ ... legal section styles ... }}
/>
```

### Merge Tag Display

In the editor, merge tags are rendered as visible chips:
- `{{ organization.name }}` → styled span showing "Org Name"
- `{{ organization.address }}` → styled span showing "Address"
- `{% unsubscribe_url %}` → styled span showing "Unsubscribe Link"

On save, these are converted back to the actual merge tag syntax.

### Floating Toolbar Positioning

The toolbar uses absolute positioning relative to the editor container, appearing above the legal section when the editor receives focus.

### Compliance Validation

Real-time checking for required Klaviyo tags with inline warning badges:
```tsx
{!hasOrgName && (
  <span className="inline-flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
    <AlertTriangle className="w-3 h-3" />
    Missing org name
  </span>
)}
```

