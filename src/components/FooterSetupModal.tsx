import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { SocialIconUploader } from './SocialIconUploader';
import type { SocialIconAsset, SocialLink } from '@/types/brand-assets';
import { Loader2 } from 'lucide-react';

interface FooterSetupModalProps {
  open: boolean;
  onClose: () => void;
  onSave: (data: {
    footerLogoUrl?: string;
    footerLogoPublicId?: string;
    socialIcons: SocialIconAsset[];
  }) => Promise<void>;
  brandSocialLinks: SocialLink[];
  footerPreviewUrl?: string;
}

export const FooterSetupModal = ({
  open,
  onClose,
  onSave,
  brandSocialLinks,
  footerPreviewUrl,
}: FooterSetupModalProps) => {
  const [footerLogo, setFooterLogo] = useState<{ url: string; publicId: string } | null>(null);
  const [socialIcons, setSocialIcons] = useState<SocialIconAsset[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Get unique platforms from brand's social links
  const platforms = brandSocialLinks.map(link => link.platform);

  const handleLogoUpload = async (file: File) => {
    // This would call the Cloudinary upload
    // For now, we'll create a preview URL
    const reader = new FileReader();
    reader.onloadend = () => {
      setFooterLogo({
        url: reader.result as string,
        publicId: `footer-logo-${Date.now()}`,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({
        footerLogoUrl: footerLogo?.url,
        footerLogoPublicId: footerLogo?.publicId,
        socialIcons,
      });
      onClose();
    } catch (error) {
      console.error('Failed to save footer:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Set Up Brand Footer</DialogTitle>
          <DialogDescription>
            Upload the assets needed for your email footer. These will be reused across all campaigns.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Footer Preview */}
          {footerPreviewUrl && (
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="text-sm font-medium mb-2">Detected Footer</p>
              <img
                src={footerPreviewUrl}
                alt="Footer preview"
                className="w-full rounded border"
              />
            </div>
          )}

          {/* Footer Logo Upload */}
          <div>
            <p className="text-sm font-medium mb-2">Footer Logo (White/Light version)</p>
            <p className="text-xs text-muted-foreground mb-3">
              Upload a white or light-colored logo for use on dark footer backgrounds.
            </p>
            {footerLogo ? (
              <div className="flex items-center gap-4 p-4 rounded-lg border bg-muted/30">
                <img
                  src={footerLogo.url}
                  alt="Footer logo"
                  className="h-12 object-contain bg-gray-800 rounded p-2"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setFooterLogo(null)}
                >
                  Remove
                </Button>
              </div>
            ) : (
              <div
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:border-primary/50 hover:bg-muted/50 transition-colors"
              >
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  id="footer-logo-upload"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file);
                  }}
                />
                <label htmlFor="footer-logo-upload" className="cursor-pointer text-center">
                  <p className="text-sm text-muted-foreground">Click to upload</p>
                </label>
              </div>
            )}
          </div>

          {/* Social Icons Upload */}
          {platforms.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Social Media Icons</p>
              <p className="text-xs text-muted-foreground mb-3">
                Upload white and black versions of each social icon for different footer backgrounds.
              </p>
              <SocialIconUploader
                platforms={platforms}
                icons={socialIcons}
                onChange={setSocialIcons}
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            Skip for now
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Footer Template
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
