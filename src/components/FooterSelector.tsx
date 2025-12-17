import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ChevronDown, Check, Plus, Save, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface BrandFooter {
  id: string;
  brand_id: string;
  name: string;
  html: string;
  is_primary: boolean | null;
  logo_url?: string | null;
  created_at: string;
  updated_at: string;
}

interface FooterSelectorProps {
  savedFooters: BrandFooter[];
  currentFooterHtml: string | undefined;
  selectedFooterId: string | null;
  onSelectFooter: (footer: BrandFooter) => void;
  onSaveFooter: (name: string, html: string) => Promise<void>;
  isModified: boolean;
  disabled?: boolean;
}

export function FooterSelector({
  savedFooters,
  currentFooterHtml,
  selectedFooterId,
  onSelectFooter,
  onSaveFooter,
  isModified,
  disabled = false,
}: FooterSelectorProps) {
  const [open, setOpen] = useState(false);
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [newFooterName, setNewFooterName] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const selectedFooter = savedFooters.find(f => f.id === selectedFooterId);
  const displayName = selectedFooter?.name || 'Select footer';

  const handleSaveFooter = async () => {
    if (!newFooterName.trim() || !currentFooterHtml) return;
    
    setIsSaving(true);
    try {
      await onSaveFooter(newFooterName.trim(), currentFooterHtml);
      setNewFooterName('');
      setSaveDialogOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            disabled={disabled}
            className={cn(
              "h-7 px-2 flex items-center gap-1.5 text-xs rounded-md transition-colors",
              "text-muted-foreground/70 hover:text-foreground hover:bg-muted/50",
              disabled && "opacity-50 cursor-not-allowed"
            )}
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="max-w-[100px] truncate">{displayName}</span>
            {isModified && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Modified" />
            )}
            <ChevronDown className="w-3 h-3" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-56 p-1" align="start">
          <div className="space-y-0.5">
            {savedFooters.length === 0 ? (
              <p className="text-xs text-muted-foreground px-2 py-1.5">No saved footers</p>
            ) : (
              savedFooters.map((footer) => (
                <button
                  key={footer.id}
                  onClick={() => {
                    onSelectFooter(footer);
                    setOpen(false);
                  }}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left hover:bg-muted/80 transition-colors",
                    selectedFooterId === footer.id && "bg-muted"
                  )}
                >
                  <Check 
                    className={cn(
                      "w-3.5 h-3.5 flex-shrink-0",
                      selectedFooterId === footer.id ? "opacity-100" : "opacity-0"
                    )} 
                  />
                  <span className="flex-1 truncate">{footer.name}</span>
                  {footer.is_primary && (
                    <span className="text-[9px] text-muted-foreground/60 uppercase">Primary</span>
                  )}
                </button>
              ))
            )}
            
            {/* Save current as new */}
            {currentFooterHtml && (
              <>
                <div className="h-px bg-border/50 my-1" />
                <button
                  onClick={() => {
                    setOpen(false);
                    setSaveDialogOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left hover:bg-muted/80 transition-colors text-primary"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Save as new version...</span>
                </button>
              </>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Save Dialog */}
      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base">Save Footer Version</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Input
              placeholder="Enter footer name..."
              value={newFooterName}
              onChange={(e) => setNewFooterName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newFooterName.trim()) {
                  handleSaveFooter();
                }
              }}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              This will save the current footer HTML as a new version for this brand.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setSaveDialogOpen(false)} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveFooter} disabled={!newFooterName.trim() || isSaving}>
              <Save className="w-3.5 h-3.5 mr-1.5" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
