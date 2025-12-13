import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Building2, Plus, Search } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { Brand } from '@/types/brand-assets';

interface BrandSelectionModalProps {
  open: boolean;
  onSelectExistingBrand: (brand: Brand) => void;
  onCreateNewBrand: (websiteUrl: string) => void;
  onClose: () => void;
}

export const BrandSelectionModal = ({
  open,
  onSelectExistingBrand,
  onCreateNewBrand,
  onClose,
}: BrandSelectionModalProps) => {
  const [mode, setMode] = useState<'select' | 'new'>('select');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isLoadingBrands, setIsLoadingBrands] = useState(true);
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (open) {
      loadBrands();
    }
  }, [open]);

  const loadBrands = async () => {
    setIsLoadingBrands(true);
    try {
      const { data, error } = await supabase
        .from('brands')
        .select('*')
        .order('name');

      if (error) throw error;

      const mappedBrands: Brand[] = (data || []).map((b) => ({
        id: b.id,
        name: b.name,
        domain: b.domain,
        websiteUrl: b.website_url || undefined,
        darkLogoUrl: b.dark_logo_url || undefined,
        darkLogoPublicId: b.dark_logo_public_id || undefined,
        lightLogoUrl: b.light_logo_url || undefined,
        lightLogoPublicId: b.light_logo_public_id || undefined,
        primaryColor: b.primary_color,
        secondaryColor: b.secondary_color,
        accentColor: b.accent_color || undefined,
        socialLinks: Array.isArray(b.social_links) ? b.social_links as any : [],
        allLinks: Array.isArray(b.all_links) ? b.all_links as any : [],
        footerHtml: b.footer_html || undefined,
        footerLogoUrl: b.footer_logo_url || undefined,
        footerLogoPublicId: b.footer_logo_public_id || undefined,
        socialIcons: Array.isArray(b.social_icons) ? b.social_icons as any : [],
        footerConfigured: b.footer_configured || false,
        createdAt: b.created_at,
        updatedAt: b.updated_at,
      }));

      setBrands(mappedBrands);
    } catch (error) {
      console.error('Failed to load brands:', error);
    } finally {
      setIsLoadingBrands(false);
    }
  };

  const filteredBrands = brands.filter((b) =>
    b.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.domain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleCreateNew = () => {
    if (websiteUrl.trim()) {
      onCreateNewBrand(websiteUrl.trim());
    }
  };

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Which brand is this campaign for?</DialogTitle>
          <DialogDescription>
            Select an existing brand or add a new one
          </DialogDescription>
        </DialogHeader>

        {mode === 'select' ? (
          <div className="space-y-4">
            {/* Search existing brands */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="Search brands..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Brand list */}
            <div className="max-h-64 overflow-y-auto space-y-2">
              {isLoadingBrands ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                </div>
              ) : filteredBrands.length > 0 ? (
                filteredBrands.map((brand) => (
                  <button
                    key={brand.id}
                    onClick={() => onSelectExistingBrand(brand)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors text-left"
                  >
                    {brand.darkLogoUrl ? (
                      <img src={brand.darkLogoUrl} alt="" className="w-8 h-8 object-contain" />
                    ) : (
                      <div className="w-8 h-8 rounded bg-muted flex items-center justify-center">
                        <Building2 className="w-4 h-4 text-muted-foreground" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{brand.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{brand.domain}</p>
                    </div>
                    <div
                      className="w-4 h-4 rounded-full shrink-0"
                      style={{ backgroundColor: brand.primaryColor }}
                    />
                  </button>
                ))
              ) : (
                <p className="text-center text-muted-foreground py-4 text-sm">
                  {searchQuery ? 'No brands match your search' : 'No brands saved yet'}
                </p>
              )}
            </div>

            {/* Add new brand button */}
            <Button
              variant="outline"
              className="w-full"
              onClick={() => setMode('new')}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add New Brand
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="website-url">Website URL</Label>
              <Input
                id="website-url"
                placeholder="example.com"
                value={websiteUrl}
                onChange={(e) => setWebsiteUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCreateNew()}
              />
              <p className="text-xs text-muted-foreground">
                We'll analyze the website to extract brand colors and social links
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setMode('select')} className="flex-1">
                Back
              </Button>
              <Button onClick={handleCreateNew} disabled={!websiteUrl.trim()} className="flex-1">
                Continue
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
