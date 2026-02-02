
# Rich Text Legal Section for Image Footers

## Problem Summary

The current legal section handling is too rigid:
1. It always appends a hardcoded template at the bottom
2. It doesn't extract the ACTUAL text from the fine print section
3. It doesn't allow users to customize layout, alignment, font sizes, etc.
4. Fine print isn't always at the bottom (see One Sol example - it's in the middle)

**User examples show:**
- Eskiin: Dark background, org name + address + "UNSUBSCRIBE" centered
- One Sol: White background, disclaimer paragraph + "Manage Preferences | Unsubscribe" in middle, then logo below
- Earth Breeze: Light background, address filled in, "Unsubscribe" link, copyright notice

## Solution Architecture

### Phase 1: Extract Actual Fine Print Text via AI

When Claude identifies a `fine_print` slice, have the AI also:
1. **OCR the text content** from that slice region
2. **Identify which parts should become Klaviyo merge tags**:
   - Org name like "Eskiin Inc." → `{{ organization.name }}`
   - Physical address → `{{ organization.address }}`
   - "Unsubscribe" link → `{% unsubscribe_url %}`
   - "Manage Preferences" link → `{% manage_preferences_url %}`
3. **Preserve the rest of the text** (disclaimers, copyright, custom messaging)
4. **Extract styling**: background color, text color, approximate font size, alignment

### Phase 2: Enhanced LegalSectionData Type

Expand the type to support rich content:

```typescript
interface LegalSectionData {
  yStart: number;
  backgroundColor: string;
  textColor: string;
  
  // NEW: Editable rich text content with Klaviyo merge tags embedded
  content: string; // HTML string with merge tags like {{ organization.name }}
  
  // NEW: Layout options
  fontSize: number;       // e.g., 11, 12, 13
  lineHeight: number;     // e.g., 1.4, 1.6
  textAlign: 'left' | 'center' | 'right';
  padding: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  
  // Keep for reference (detected elements from OCR)
  detectedElements: {
    type: LegalElementType;
    text: string;
  }[];
}
```

### Phase 3: Rich Text Editor Component

Create `LegalContentEditor` that:
1. Shows a contenteditable area or textarea with the HTML content
2. Has a toolbar for: font size, alignment, colors
3. Has quick-insert buttons for Klaviyo merge tags
4. Shows live preview of how it will render
5. Auto-inserts required elements if missing (org name, address, unsubscribe)

### Phase 4: AI Prompt Update for Fine Print Extraction

Update the `buildFooterPrompt` in `auto-slice-v2` to also output extracted text when fine print is detected:

```text
If you identify a fine_print section, also extract:
{
  "finePrintContent": {
    "rawText": "<the actual text visible in this section>",
    "detectedOrgName": "<if org name visible, e.g. 'Eskiin Inc.'>",
    "detectedAddress": "<if address visible>",
    "hasUnsubscribe": true/false,
    "hasManagePreferences": true/false,
    "estimatedFontSize": 11-14,
    "textAlignment": "center" | "left",
    "backgroundColor": "#hex",
    "textColor": "#hex"
  }
}
```

### Phase 5: Process-Footer-Queue Conversion Logic

When a fine_print slice is found:
1. Take the AI-extracted `finePrintContent`
2. Build initial HTML content, replacing:
   - Detected org name → `{{ organization.name }}`
   - Detected address → `{{ organization.address }}`
   - "Unsubscribe" text → `<a href="{% unsubscribe_url %}">Unsubscribe</a>`
   - Keep other text verbatim (disclaimers, copyright, etc.)
3. Store this as `legalSection.content`

### Phase 6: Handle Fine Print NOT at Bottom

For cases like One Sol where fine print is in the middle:
1. Claude labels it as `fine_print` with its actual yTop/yBottom
2. It gets converted to HTML block
3. The remaining slices BELOW it (like logo) stay as image slices
4. In the final HTML, the order is preserved: image slices → HTML legal → more image slices

This requires changing `generateImageFooterHtml` to insert the legal section at the correct position based on its `yStart`, not always at the end.

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/types/footer.ts` | Expand `LegalSectionData` with content, fontSize, textAlign, padding |
| `src/components/footer/LegalSectionEditor.tsx` | Complete rewrite: rich text editor with toolbar, merge tag insertion, validation |
| `supabase/functions/auto-slice-v2/index.ts` | Add `finePrintContent` extraction to footer prompt output |
| `supabase/functions/process-footer-queue/index.ts` | Build HTML content from extracted text, convert org/address to merge tags |
| `src/types/footer.ts` → `generateImageFooterHtml` | Insert legal section at correct Y position (not always at end) |
| `src/pages/ImageFooterStudio.tsx` | Update to pass new props to LegalSectionEditor, show in correct position |

---

## Implementation Details

### Updated LegalSectionData Type

```typescript
export interface LegalSectionData {
  yStart: number;
  yEnd?: number; // NEW: to know where it ends for positioning
  backgroundColor: string;
  textColor: string;
  
  // NEW: Editable content
  content: string; // Raw HTML with Klaviyo merge tags
  
  // NEW: Typography
  fontSize: number;
  lineHeight: number;
  textAlign: 'left' | 'center' | 'right';
  
  // NEW: Spacing
  paddingTop: number;
  paddingBottom: number;
  paddingHorizontal: number;
  
  // Keep for validation
  detectedElements: { type: LegalElementType; text: string }[];
  
  // NEW: Compliance flags
  hasOrgName: boolean;
  hasOrgAddress: boolean;
  hasUnsubscribe: boolean;
}
```

### LegalContentEditor Component

```tsx
function LegalContentEditor({ legalSection, onUpdate }) {
  const [content, setContent] = useState(legalSection.content);
  
  // Check for required Klaviyo merge tags
  const hasOrgName = content.includes('{{ organization.name }}');
  const hasOrgAddress = content.includes('{{ organization.address }}');
  const hasUnsubscribe = content.includes('{% unsubscribe_url %}');
  const isCompliant = hasOrgName && hasOrgAddress && hasUnsubscribe;
  
  const insertTag = (tag: string) => {
    setContent(prev => prev + '\n' + tag);
  };
  
  return (
    <div>
      {/* Toolbar */}
      <div className="flex gap-2 mb-2">
        <Button onClick={() => insertTag('{{ organization.name }}')}>
          + Org Name
        </Button>
        <Button onClick={() => insertTag('{{ organization.address }}')}>
          + Address  
        </Button>
        <Button onClick={() => insertTag('<a href="{% unsubscribe_url %}">Unsubscribe</a>')}>
          + Unsubscribe
        </Button>
      </div>
      
      {/* Color pickers */}
      <div className="flex gap-4">
        <ColorPicker label="Background" value={legalSection.backgroundColor} />
        <ColorPicker label="Text" value={legalSection.textColor} />
      </div>
      
      {/* Font size, alignment */}
      <div className="flex gap-4">
        <FontSizeSelect value={legalSection.fontSize} />
        <AlignmentToggle value={legalSection.textAlign} />
      </div>
      
      {/* Content editor */}
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={6}
        className="font-mono text-sm"
      />
      
      {/* Compliance warnings */}
      {!isCompliant && (
        <Alert variant="warning">
          Missing required elements:
          {!hasOrgName && <Badge>Organization Name</Badge>}
          {!hasOrgAddress && <Badge>Organization Address</Badge>}
          {!hasUnsubscribe && <Badge>Unsubscribe Link</Badge>}
        </Alert>
      )}
      
      {/* Live preview */}
      <div style={{ 
        backgroundColor: legalSection.backgroundColor,
        color: legalSection.textColor,
        fontSize: legalSection.fontSize,
        textAlign: legalSection.textAlign,
        padding: '24px 20px'
      }}>
        <div dangerouslySetInnerHTML={{ __html: content }} />
      </div>
    </div>
  );
}
```

### AI Fine Print Extraction Prompt Addition

Add to `buildFooterPrompt`:

```text
## FINE PRINT TEXT EXTRACTION

When you identify a "fine_print" section, you must ALSO extract its content:

In your output, add a "finePrintContent" object:
{
  "finePrintContent": {
    "rawText": "Eskiin Inc. 9450 Southwest Gemini Drive, Beaverton, Oregon 97008, United States\n\nUNSUBSCRIBE",
    "detectedOrgName": "Eskiin Inc.",
    "detectedAddress": "9450 Southwest Gemini Drive, Beaverton, Oregon 97008, United States",
    "hasUnsubscribeLink": true,
    "hasManagePreferences": false,
    "textAlignment": "center",
    "estimatedFontSize": 12
  }
}

This helps us convert the static image text into editable HTML with Klaviyo merge tags.
```

### Content Conversion Logic

```typescript
function convertFinePrintToHtml(finePrintContent: FinePrintContent): string {
  let html = finePrintContent.rawText;
  
  // Replace detected org name with merge tag
  if (finePrintContent.detectedOrgName) {
    html = html.replace(
      finePrintContent.detectedOrgName,
      '{{ organization.name }}'
    );
  }
  
  // Replace detected address with merge tag
  if (finePrintContent.detectedAddress) {
    html = html.replace(
      finePrintContent.detectedAddress,
      '{{ organization.address }}'
    );
  }
  
  // Wrap unsubscribe text in link
  if (finePrintContent.hasUnsubscribeLink) {
    html = html.replace(
      /unsubscribe/i,
      '<a href="{% unsubscribe_url %}" style="text-decoration: underline;">Unsubscribe</a>'
    );
  }
  
  // Wrap manage preferences in link
  if (finePrintContent.hasManagePreferences) {
    html = html.replace(
      /manage preferences/i,
      '<a href="{% manage_preferences_url %}" style="text-decoration: underline;">Manage Preferences</a>'
    );
  }
  
  // Convert newlines to <br>
  html = html.replace(/\n/g, '<br>');
  
  return html;
}
```

---

## Handling Fine Print in the Middle (One Sol Example)

The current `generateImageFooterHtml` always puts legal at the end. We need to insert it at the correct position:

```typescript
function generateImageFooterHtml(
  slices: ImageFooterSlice[],
  legalSection: LegalSectionData | null,
  footerWidth: number = 600
): string {
  // Sort slices by yTop
  const sortedSlices = [...slices].sort((a, b) => a.yTop - b.yTop);
  
  // Find where to insert legal section based on yStart
  const legalYStart = legalSection?.yStart ?? Infinity;
  
  const slicesBefore = sortedSlices.filter(s => s.yBottom <= legalYStart);
  const slicesAfter = sortedSlices.filter(s => s.yTop >= (legalSection?.yEnd ?? legalYStart));
  
  // Build HTML:
  // 1. Image slices before legal
  // 2. Legal HTML section
  // 3. Image slices after legal (if any)
  
  return [
    renderImageSlices(slicesBefore),
    legalSection ? renderLegalHtml(legalSection) : '',
    renderImageSlices(slicesAfter)
  ].join('\n');
}
```

---

## Expected Outcome

1. **Eskiin footer**: AI extracts "Eskiin Inc.", address, and "UNSUBSCRIBE" → converted to merge tags, user sees editable text area with styling controls

2. **One Sol footer**: AI detects fine print in MIDDLE, extracts disclaimer + links → converted to HTML, logo slice below stays as image

3. **Earth Breeze footer**: AI detects address is already populated → replaces with `{{ organization.address }}`, preserves "Unsubscribe" and copyright

4. **User editing**: Can change font size, colors, alignment, add/remove text while maintaining required Klaviyo merge tags

5. **Compliance validation**: Warning if missing org name, address, or unsubscribe - quick buttons to insert them
