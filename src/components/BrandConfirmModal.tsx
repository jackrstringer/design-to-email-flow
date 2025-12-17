import { useState } from 'react';
import { Globe, Check, Pencil } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BrandConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detectedName: string | null;
  detectedUrl: string | null;
  onConfirm: (url: string) => void;
  isLoading?: boolean;
}

export function BrandConfirmModal({
  open,
  onOpenChange,
  detectedName,
  detectedUrl,
  onConfirm,
  isLoading = false,
}: BrandConfirmModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedUrl, setEditedUrl] = useState(detectedUrl || '');

  // Reset state when modal opens with new data
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setEditedUrl(detectedUrl || '');
      setIsEditing(!detectedUrl);
    }
    onOpenChange(newOpen);
  };

  const handleConfirm = () => {
    const url = isEditing ? editedUrl : (detectedUrl || editedUrl);
    if (url) {
      // Ensure URL has protocol
      const formattedUrl = url.startsWith('http') ? url : `https://${url}`;
      onConfirm(formattedUrl);
    }
  };

  const displayUrl = isEditing ? editedUrl : detectedUrl;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            Brand Detected
          </DialogTitle>
          <DialogDescription>
            We found brand information in your campaign. Please confirm the website URL.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {detectedName && (
            <div className="text-center">
              <p className="text-lg font-semibold">{detectedName}</p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="brand-url" className="text-sm text-muted-foreground">
              Brand Website
            </Label>
            
            {isEditing ? (
              <Input
                id="brand-url"
                value={editedUrl}
                onChange={(e) => setEditedUrl(e.target.value)}
                placeholder="https://example.com"
                className="font-mono text-sm"
                autoFocus
              />
            ) : (
              <div className="flex items-center gap-2">
                <div className="flex-1 rounded-md border bg-muted/50 px-3 py-2 font-mono text-sm">
                  {displayUrl || 'No URL detected'}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditedUrl(detectedUrl || '');
                    setIsEditing(true);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center">
            We'll analyze this website to extract brand colors, fonts, and social links.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            className="flex-1"
            onClick={handleConfirm}
            disabled={!displayUrl || isLoading}
          >
            {isLoading ? (
              'Analyzing...'
            ) : (
              <>
                <Check className="h-4 w-4 mr-2" />
                Confirm & Continue
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
