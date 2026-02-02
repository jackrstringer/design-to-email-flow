import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  AlignLeft, 
  AlignCenter, 
  AlignRight, 
  Plus,
  AlertTriangle,
  Check 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LegalSectionData } from '@/types/footer';
import { generateDefaultLegalContent } from '@/types/footer';

interface LegalContentEditorProps {
  legalSection: LegalSectionData;
  onUpdate: (updates: Partial<LegalSectionData>) => void;
  footerWidth?: number;
}

export function LegalContentEditor({ 
  legalSection, 
  onUpdate,
  footerWidth = 600 
}: LegalContentEditorProps) {
  const [content, setContent] = useState(legalSection.content || generateDefaultLegalContent());
  
  // Update parent when content changes
  useEffect(() => {
    onUpdate({ content });
  }, [content]);
  
  // Compliance validation
  const hasOrgName = content.includes('{{ organization.name }}');
  const hasOrgAddress = content.includes('{{ organization.address }}');
  const hasUnsubscribe = content.includes('{% unsubscribe_url %}');
  const isCompliant = hasOrgName && hasOrgAddress && hasUnsubscribe;
  
  // Missing elements
  const missingElements: string[] = [];
  if (!hasOrgName) missingElements.push('Organization Name');
  if (!hasOrgAddress) missingElements.push('Organization Address');
  if (!hasUnsubscribe) missingElements.push('Unsubscribe Link');
  
  // Insert merge tag at cursor position
  const insertTag = (tag: string) => {
    setContent(prev => prev + tag);
  };
  
  // Typography defaults
  const fontSize = legalSection.fontSize || 11;
  const lineHeight = legalSection.lineHeight || 1.6;
  const textAlign = legalSection.textAlign || 'center';
  const paddingTop = legalSection.paddingTop ?? 24;
  const paddingBottom = legalSection.paddingBottom ?? 24;
  const paddingHorizontal = legalSection.paddingHorizontal ?? 20;
  
  return (
    <div className="space-y-4">
      {/* Compliance Warning */}
      {!isCompliant && (
        <Alert variant="destructive" className="border-amber-500 bg-amber-50 text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">Missing required elements:</span>
            {missingElements.map((el) => (
              <Badge key={el} variant="outline" className="text-amber-700 border-amber-300">
                {el}
              </Badge>
            ))}
          </AlertDescription>
        </Alert>
      )}
      
      {isCompliant && (
        <Alert className="border-green-500 bg-green-50 text-green-900">
          <Check className="h-4 w-4 text-green-600" />
          <AlertDescription>
            All required Klaviyo merge tags are present. Footer is compliant!
          </AlertDescription>
        </Alert>
      )}
      
      {/* Merge Tag Buttons */}
      <div className="flex flex-wrap gap-2">
        <Label className="w-full text-xs text-muted-foreground">Quick Insert Klaviyo Tags:</Label>
        <Button
          type="button"
          variant={hasOrgName ? "secondary" : "outline"}
          size="sm"
          onClick={() => insertTag('{{ organization.name }}')}
          className="text-xs"
        >
          <Plus className="w-3 h-3 mr-1" />
          Org Name
        </Button>
        <Button
          type="button"
          variant={hasOrgAddress ? "secondary" : "outline"}
          size="sm"
          onClick={() => insertTag('{{ organization.address }}')}
          className="text-xs"
        >
          <Plus className="w-3 h-3 mr-1" />
          Address
        </Button>
        <Button
          type="button"
          variant={hasUnsubscribe ? "secondary" : "outline"}
          size="sm"
          onClick={() => insertTag('<a href="{% unsubscribe_url %}">Unsubscribe</a>')}
          className="text-xs"
        >
          <Plus className="w-3 h-3 mr-1" />
          Unsubscribe
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => insertTag('<a href="{% manage_preferences_url %}">Manage Preferences</a>')}
          className="text-xs"
        >
          <Plus className="w-3 h-3 mr-1" />
          Preferences
        </Button>
      </div>
      
      {/* Style Controls Row */}
      <div className="flex items-center gap-6 flex-wrap">
        {/* Background Color */}
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Background</Label>
          <input
            type="color"
            value={legalSection.backgroundColor || '#1a1a1a'}
            onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
            className="w-8 h-8 rounded border cursor-pointer"
          />
          <Input
            value={legalSection.backgroundColor || '#1a1a1a'}
            onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
            className="h-8 w-20 text-xs font-mono"
          />
        </div>

        {/* Text Color */}
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Text</Label>
          <input
            type="color"
            value={legalSection.textColor || '#ffffff'}
            onChange={(e) => onUpdate({ textColor: e.target.value })}
            className="w-8 h-8 rounded border cursor-pointer"
          />
          <Input
            value={legalSection.textColor || '#ffffff'}
            onChange={(e) => onUpdate({ textColor: e.target.value })}
            className="h-8 w-20 text-xs font-mono"
          />
        </div>
        
        {/* Font Size */}
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Font Size</Label>
          <Input
            type="number"
            value={fontSize}
            onChange={(e) => onUpdate({ fontSize: parseInt(e.target.value) || 11 })}
            className="h-8 w-16 text-xs"
            min={8}
            max={18}
          />
          <span className="text-xs text-muted-foreground">px</span>
        </div>
        
        {/* Alignment */}
        <div className="flex items-center gap-1 border rounded-md p-0.5">
          <button
            type="button"
            onClick={() => onUpdate({ textAlign: 'left' })}
            className={cn(
              "p-1.5 rounded transition-colors",
              textAlign === 'left' ? "bg-muted" : "hover:bg-muted/50"
            )}
          >
            <AlignLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ textAlign: 'center' })}
            className={cn(
              "p-1.5 rounded transition-colors",
              textAlign === 'center' ? "bg-muted" : "hover:bg-muted/50"
            )}
          >
            <AlignCenter className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ textAlign: 'right' })}
            className={cn(
              "p-1.5 rounded transition-colors",
              textAlign === 'right' ? "bg-muted" : "hover:bg-muted/50"
            )}
          >
            <AlignRight className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* Content Editor */}
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">
          Content (HTML with Klaviyo merge tags)
        </Label>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          className="font-mono text-sm"
          placeholder="Enter your legal section content..."
        />
        <p className="text-xs text-muted-foreground mt-1">
          Use <code className="bg-muted px-1 rounded">{'<br>'}</code> for line breaks. 
          Links will automatically inherit the text color.
        </p>
      </div>
      
      {/* Live Preview */}
      <div>
        <Label className="text-xs text-muted-foreground mb-2 block">Preview</Label>
        <div className="rounded-lg overflow-hidden border">
          <div
            style={{
              backgroundColor: legalSection.backgroundColor || '#1a1a1a',
              padding: `${paddingTop}px ${paddingHorizontal}px ${paddingBottom}px`,
              textAlign: textAlign,
              maxWidth: footerWidth,
              margin: '0 auto',
            }}
          >
            <div
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: lineHeight,
                color: legalSection.textColor || '#ffffff',
                fontFamily: 'Arial, Helvetica, sans-serif',
              }}
              dangerouslySetInnerHTML={{ 
                __html: content
                  .replace(/\{\{\s*organization\.name\s*\}\}/g, '<span style="background:rgba(255,255,255,0.2);padding:0 4px;border-radius:2px;">Acme Inc.</span>')
                  .replace(/\{\{\s*organization\.address\s*\}\}/g, '<span style="background:rgba(255,255,255,0.2);padding:0 4px;border-radius:2px;">123 Main St, City, ST 12345</span>')
                  .replace(/\{%\s*unsubscribe_url\s*%\}/g, '#')
                  .replace(/\{%\s*manage_preferences_url\s*%\}/g, '#')
              }}
            />
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-2 italic">
          Highlighted values will be replaced with actual data by Klaviyo when the email is sent.
        </p>
      </div>
    </div>
  );
}
