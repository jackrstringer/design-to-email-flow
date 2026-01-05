import { useState } from 'react';
import { Check, Copy, ExternalLink, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';

interface CampaignSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  campaignId: string;
  campaignName?: string;
  onViewCampaign: () => void;
  onCreateAnother: () => void;
}

export function CampaignSuccessDialog({
  open,
  onOpenChange,
  campaignId,
  campaignName,
  onViewCampaign,
  onCreateAnother,
}: CampaignSuccessDialogProps) {
  const [copied, setCopied] = useState(false);
  
  const campaignUrl = `${window.location.origin}/campaign/${campaignId}`;

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(campaignUrl);
      setCopied(true);
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy link');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <Check className="w-6 h-6 text-green-600" />
          </div>
          <DialogTitle className="text-center">Campaign Created!</DialogTitle>
          <DialogDescription className="text-center">
            {campaignName ? `"${campaignName}" is ready.` : 'Your campaign is ready.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">
              Campaign Link
            </label>
            <div className="flex items-center gap-2">
              <div className="flex-1 px-3 py-2 rounded-md bg-muted text-sm font-mono truncate">
                {campaignUrl}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={handleCopyLink}
                className="flex-shrink-0"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={onCreateAnother}
            className="flex-1"
          >
            <Plus className="w-4 h-4 mr-2" />
            Create Another
          </Button>
          <Button
            onClick={onViewCampaign}
            className="flex-1"
          >
            <ExternalLink className="w-4 h-4 mr-2" />
            View Campaign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
