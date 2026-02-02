import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Plus,
  AlertTriangle,
  Type
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LegalSectionData } from '@/types/footer';
import { generateDefaultLegalContent } from '@/types/footer';

interface InlineLegalEditorProps {
  legalSection: LegalSectionData;
  onUpdate: (updates: Partial<LegalSectionData>) => void;
  width: number;
}

// Merge tag display mappings
const MERGE_TAG_DISPLAY: Record<string, string> = {
  '{{ organization.name }}': 'Acme Inc.',
  '{{ organization.address }}': '123 Main St, City, ST 12345',
};

// Convert merge tags to display chips for editing
function contentToDisplayHtml(content: string): string {
  let html = content;
  
  // Replace merge tags with visible chips
  html = html.replace(
    /\{\{\s*organization\.name\s*\}\}/g,
    '<span class="merge-tag" data-tag="org-name" contenteditable="false" style="background:rgba(59,130,246,0.15);color:#2563eb;padding:1px 6px;border-radius:3px;font-size:inherit;white-space:nowrap;cursor:default;">Org Name</span>'
  );
  html = html.replace(
    /\{\{\s*organization\.address\s*\}\}/g,
    '<span class="merge-tag" data-tag="org-address" contenteditable="false" style="background:rgba(59,130,246,0.15);color:#2563eb;padding:1px 6px;border-radius:3px;font-size:inherit;white-space:nowrap;cursor:default;">Address</span>'
  );
  html = html.replace(
    /\{%\s*unsubscribe_url\s*%\}/g,
    '<span class="merge-tag" data-tag="unsub" contenteditable="false" style="background:rgba(59,130,246,0.15);color:#2563eb;padding:1px 6px;border-radius:3px;font-size:inherit;white-space:nowrap;cursor:default;">Unsubscribe</span>'
  );
  html = html.replace(
    /\{%\s*manage_preferences_url\s*%\}/g,
    '<span class="merge-tag" data-tag="prefs" contenteditable="false" style="background:rgba(59,130,246,0.15);color:#2563eb;padding:1px 6px;border-radius:3px;font-size:inherit;white-space:nowrap;cursor:default;">Preferences</span>'
  );
  
  return html;
}

// Convert display HTML back to merge tags for storage
function displayHtmlToContent(html: string): string {
  let content = html;
  
  // Replace chips back to merge tags
  content = content.replace(/<span[^>]*data-tag="org-name"[^>]*>.*?<\/span>/gi, '{{ organization.name }}');
  content = content.replace(/<span[^>]*data-tag="org-address"[^>]*>.*?<\/span>/gi, '{{ organization.address }}');
  content = content.replace(/<span[^>]*data-tag="unsub"[^>]*>.*?<\/span>/gi, '{% unsubscribe_url %}');
  content = content.replace(/<span[^>]*data-tag="prefs"[^>]*>.*?<\/span>/gi, '{% manage_preferences_url %}');
  
  return content;
}

export function InlineLegalEditor({ 
  legalSection, 
  onUpdate,
  width 
}: InlineLegalEditorProps) {
  const [isFocused, setIsFocused] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  
  const content = legalSection.content || generateDefaultLegalContent();
  
  // Compliance validation
  const hasOrgName = content.includes('{{ organization.name }}');
  const hasOrgAddress = content.includes('{{ organization.address }}');
  const hasUnsubscribe = content.includes('{% unsubscribe_url %}');
  const isCompliant = hasOrgName && hasOrgAddress && hasUnsubscribe;
  
  // Style values with defaults
  const bgColor = legalSection.backgroundColor || '#ffffff';
  const textColor = legalSection.textColor || '#1a1a1a';
  const fontSize = legalSection.fontSize || 11;
  const lineHeight = legalSection.lineHeight || 1.6;
  const textAlign = legalSection.textAlign || 'center';
  const paddingTop = legalSection.paddingTop ?? 24;
  const paddingBottom = legalSection.paddingBottom ?? 24;
  const paddingHorizontal = legalSection.paddingHorizontal ?? 20;
  
  // Convert content to display HTML
  const displayHtml = contentToDisplayHtml(content);
  
  // Handle content changes on blur
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    if (editorRef.current) {
      const newContent = displayHtmlToContent(editorRef.current.innerHTML);
      if (newContent !== content) {
        onUpdate({ content: newContent });
      }
    }
  }, [content, onUpdate]);
  
  // Insert merge tag at cursor position
  const insertTag = useCallback((tagType: 'org-name' | 'org-address' | 'unsub' | 'prefs') => {
    if (!editorRef.current) return;
    
    const tagMap: Record<string, { display: string; raw: string }> = {
      'org-name': { display: 'Org Name', raw: '{{ organization.name }}' },
      'org-address': { display: 'Address', raw: '{{ organization.address }}' },
      'unsub': { display: 'Unsubscribe', raw: '{% unsubscribe_url %}' },
      'prefs': { display: 'Preferences', raw: '{% manage_preferences_url %}' },
    };
    
    const tag = tagMap[tagType];
    
    // Insert chip HTML at cursor
    const chipHtml = `<span class="merge-tag" data-tag="${tagType}" contenteditable="false" style="background:rgba(59,130,246,0.15);color:#2563eb;padding:1px 6px;border-radius:3px;font-size:inherit;white-space:nowrap;cursor:default;">${tag.display}</span>&nbsp;`;
    
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      if (editorRef.current.contains(range.commonAncestorContainer)) {
        range.deleteContents();
        const temp = document.createElement('div');
        temp.innerHTML = chipHtml;
        const frag = document.createDocumentFragment();
        let node;
        while ((node = temp.firstChild)) {
          frag.appendChild(node);
        }
        range.insertNode(frag);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
      } else {
        editorRef.current.innerHTML += chipHtml;
      }
    } else {
      editorRef.current.innerHTML += chipHtml;
    }
    
    // Trigger update
    const newContent = displayHtmlToContent(editorRef.current.innerHTML);
    onUpdate({ content: newContent });
  }, [onUpdate]);
  
  return (
    <div className="relative" style={{ width }}>
      {/* Floating Toolbar */}
      <div 
        className={cn(
          "absolute -top-12 left-0 right-0 z-20 flex items-center justify-center gap-1 p-1.5 bg-background border rounded-lg shadow-lg transition-all",
          isFocused ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
        )}
      >
        {/* Background Color */}
        <div className="flex items-center gap-1 px-2 border-r">
          <span className="text-[10px] text-muted-foreground">BG</span>
          <input
            type="color"
            value={bgColor}
            onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
            className="w-6 h-6 rounded border cursor-pointer"
            title="Background Color"
          />
        </div>
        
        {/* Text Color */}
        <div className="flex items-center gap-1 px-2 border-r">
          <Type className="w-3 h-3 text-muted-foreground" />
          <input
            type="color"
            value={textColor}
            onChange={(e) => onUpdate({ textColor: e.target.value })}
            className="w-6 h-6 rounded border cursor-pointer"
            title="Text Color"
          />
        </div>
        
        {/* Font Size */}
        <div className="flex items-center gap-1 px-2 border-r">
          <input
            type="number"
            value={fontSize}
            onChange={(e) => onUpdate({ fontSize: parseInt(e.target.value) || 11 })}
            className="w-10 h-6 text-[10px] text-center border rounded"
            min={8}
            max={18}
            title="Font Size"
          />
          <span className="text-[10px] text-muted-foreground">px</span>
        </div>
        
        {/* Alignment */}
        <div className="flex items-center gap-0.5 px-2 border-r">
          <button
            type="button"
            onClick={() => onUpdate({ textAlign: 'left' })}
            className={cn(
              "p-1 rounded transition-colors",
              textAlign === 'left' ? "bg-muted" : "hover:bg-muted/50"
            )}
            title="Align Left"
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ textAlign: 'center' })}
            className={cn(
              "p-1 rounded transition-colors",
              textAlign === 'center' ? "bg-muted" : "hover:bg-muted/50"
            )}
            title="Align Center"
          >
            <AlignCenter className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ textAlign: 'right' })}
            className={cn(
              "p-1 rounded transition-colors",
              textAlign === 'right' ? "bg-muted" : "hover:bg-muted/50"
            )}
            title="Align Right"
          >
            <AlignRight className="w-3.5 h-3.5" />
          </button>
        </div>
        
        {/* Merge Tag Buttons */}
        <div className="flex items-center gap-1 px-2">
          <button
            type="button"
            onClick={() => insertTag('org-name')}
            className={cn(
              "flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded border transition-colors",
              hasOrgName ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
            )}
            title="Insert Organization Name"
          >
            <Plus className="w-2.5 h-2.5" />
            Org
          </button>
          <button
            type="button"
            onClick={() => insertTag('org-address')}
            className={cn(
              "flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded border transition-colors",
              hasOrgAddress ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
            )}
            title="Insert Organization Address"
          >
            <Plus className="w-2.5 h-2.5" />
            Addr
          </button>
          <button
            type="button"
            onClick={() => insertTag('unsub')}
            className={cn(
              "flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded border transition-colors",
              hasUnsubscribe ? "bg-green-50 border-green-200 text-green-700" : "bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100"
            )}
            title="Insert Unsubscribe Link"
          >
            <Plus className="w-2.5 h-2.5" />
            Unsub
          </button>
          <button
            type="button"
            onClick={() => insertTag('prefs')}
            className="flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded border bg-muted/50 border-border text-muted-foreground hover:bg-muted transition-colors"
            title="Insert Manage Preferences Link"
          >
            <Plus className="w-2.5 h-2.5" />
            Prefs
          </button>
        </div>
      </div>
      
      {/* Editable Content Area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onFocus={() => setIsFocused(true)}
        onBlur={handleBlur}
        className={cn(
          "outline-none cursor-text transition-all",
          isFocused && "ring-2 ring-primary ring-offset-2"
        )}
        style={{
          backgroundColor: bgColor,
          padding: `${paddingTop}px ${paddingHorizontal}px ${paddingBottom}px`,
          textAlign: textAlign,
          fontSize: `${fontSize}px`,
          lineHeight: lineHeight,
          color: textColor,
          fontFamily: 'Arial, Helvetica, sans-serif',
        }}
        dangerouslySetInnerHTML={{ __html: displayHtml }}
      />
      
      {/* Compliance Badges */}
      {!isCompliant && (
        <div className="flex items-center justify-center gap-2 mt-2 flex-wrap">
          {!hasOrgName && (
            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              Missing org name
            </span>
          )}
          {!hasOrgAddress && (
            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              Missing address
            </span>
          )}
          {!hasUnsubscribe && (
            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
              <AlertTriangle className="w-3 h-3" />
              Missing unsubscribe
            </span>
          )}
        </div>
      )}
      
      {/* Click hint when not focused */}
      {!isFocused && (
        <p className="text-center text-[10px] text-muted-foreground mt-1 opacity-50">
          Click to edit legal section
        </p>
      )}
    </div>
  );
}
