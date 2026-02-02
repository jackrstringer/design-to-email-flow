import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { LegalSectionData } from '@/types/footer';

interface LegalSectionEditorProps {
  legalSection: LegalSectionData;
  onUpdate: (updates: Partial<LegalSectionData>) => void;
}

export function LegalSectionEditor({ legalSection, onUpdate }: LegalSectionEditorProps) {
  return (
    <div className="space-y-4">
      {/* Color controls */}
      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Background</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={legalSection.backgroundColor || '#1a1a1a'}
              onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
              className="w-8 h-8 rounded border cursor-pointer"
            />
            <Input
              value={legalSection.backgroundColor || '#1a1a1a'}
              onChange={(e) => onUpdate({ backgroundColor: e.target.value })}
              placeholder="#1a1a1a"
              className="h-8 w-24 text-sm font-mono"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Label className="text-xs whitespace-nowrap">Text Color</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={legalSection.textColor || '#ffffff'}
              onChange={(e) => onUpdate({ textColor: e.target.value })}
              className="w-8 h-8 rounded border cursor-pointer"
            />
            <Input
              value={legalSection.textColor || '#ffffff'}
              onChange={(e) => onUpdate({ textColor: e.target.value })}
              placeholder="#ffffff"
              className="h-8 w-24 text-sm font-mono"
            />
          </div>
        </div>
      </div>

      {/* Live preview */}
      <div className="rounded-lg overflow-hidden border">
        <div
          style={{
            backgroundColor: legalSection.backgroundColor || '#1a1a1a',
            padding: '24px 20px',
            textAlign: 'center',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '11px',
              lineHeight: 1.6,
              color: legalSection.textColor || '#ffffff',
              fontFamily: 'Arial, Helvetica, sans-serif',
            }}
          >
            {'{{ organization.name }}'} | {'{{ organization.address }}'}
          </p>
          <p
            style={{
              margin: '12px 0 0',
              fontSize: '11px',
              color: legalSection.textColor || '#ffffff',
              fontFamily: 'Arial, Helvetica, sans-serif',
            }}
          >
            <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Unsubscribe</span>
            {' | '}
            <span style={{ textDecoration: 'underline', cursor: 'pointer' }}>Manage Preferences</span>
          </p>
        </div>
      </div>

      {/* Detected elements info */}
      {legalSection.detectedElements && legalSection.detectedElements.length > 0 && (
        <div className="text-xs text-muted-foreground">
          <span className="font-medium">Detected:</span>{' '}
          {legalSection.detectedElements.map(el => el.type).join(', ')}
        </div>
      )}

      {/* Klaviyo merge tag note */}
      <p className="text-xs text-muted-foreground">
        This section uses Klaviyo merge tags for org name, address, and unsubscribe links.
      </p>
    </div>
  );
}
