import { useState, useEffect } from 'react';
import { Plus, MoreHorizontal, Pencil, Trash2, Key } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Brand } from '@/types/brand-assets';

interface BrandsViewProps {
  brands: Brand[];
  onBrandSelect: (brand: Brand) => void;
  onAddBrand: () => void;
  onBrandsChange: () => void;
}

export function BrandsView({ brands, onBrandSelect, onAddBrand, onBrandsChange }: BrandsViewProps) {
  const [campaignCounts, setCampaignCounts] = useState<Record<string, number>>({});
  const [editApiKeyBrand, setEditApiKeyBrand] = useState<Brand | null>(null);
  const [apiKeyValue, setApiKeyValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    // Fetch campaign counts for each brand
    async function fetchCounts() {
      const counts: Record<string, number> = {};
      for (const brand of brands) {
        const { count } = await supabase
          .from('campaigns')
          .select('*', { count: 'exact', head: true })
          .eq('brand_id', brand.id);
        counts[brand.id] = count || 0;
      }
      setCampaignCounts(counts);
    }
    fetchCounts();
  }, [brands]);

  const handleDeleteBrand = async (brand: Brand) => {
    if (!confirm(`Delete ${brand.name}? This cannot be undone.`)) return;
    
    const { error } = await supabase
      .from('brands')
      .delete()
      .eq('id', brand.id);

    if (error) {
      toast.error('Failed to delete brand');
      return;
    }

    toast.success('Brand deleted');
    onBrandsChange();
  };

  const handleSaveApiKey = async () => {
    if (!editApiKeyBrand) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('brands')
        .update({ klaviyo_api_key: apiKeyValue || null })
        .eq('id', editApiKeyBrand.id);

      if (error) throw error;

      toast.success('API key updated');
      setEditApiKeyBrand(null);
      setApiKeyValue('');
      onBrandsChange();
    } catch (error) {
      toast.error('Failed to update API key');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Brands</h2>
          <p className="text-sm text-muted-foreground">Manage your brand configurations</p>
        </div>
        <Button onClick={onAddBrand}>
          <Plus className="w-4 h-4 mr-2" />
          Add Brand
        </Button>
      </div>

      {brands.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-xl">
          <p className="text-muted-foreground mb-4">No brands configured yet</p>
          <Button onClick={onAddBrand}>
            <Plus className="w-4 h-4 mr-2" />
            Add Your First Brand
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {brands.map((brand) => (
            <div
              key={brand.id}
              className="group relative rounded-xl border border-border/60 bg-card p-5 hover:border-primary/30 hover:shadow-sm transition-all cursor-pointer"
              onClick={() => onBrandSelect(brand)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold"
                    style={{ backgroundColor: brand.primaryColor }}
                  >
                    {brand.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-medium">{brand.name}</h3>
                    <p className="text-xs text-muted-foreground">{brand.domain}</p>
                  </div>
                </div>
                
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={(e) => {
                      e.stopPropagation();
                      setEditApiKeyBrand(brand);
                      setApiKeyValue(brand.klaviyoApiKey || '');
                    }}>
                      <Key className="w-4 h-4 mr-2" />
                      {brand.klaviyoApiKey ? 'Update' : 'Add'} API Key
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      className="text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteBrand(brand);
                      }}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>{campaignCounts[brand.id] || 0} campaigns</span>
                {brand.klaviyoApiKey ? (
                  <span className="text-green-600">API Connected</span>
                ) : (
                  <span className="text-amber-600">No API Key</span>
                )}
              </div>

              {/* Color swatches */}
              <div className="flex gap-1 mt-3">
                <div 
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: brand.primaryColor }}
                  title="Primary"
                />
                <div 
                  className="w-6 h-6 rounded"
                  style={{ backgroundColor: brand.secondaryColor }}
                  title="Secondary"
                />
                {brand.accentColor && (
                  <div 
                    className="w-6 h-6 rounded"
                    style={{ backgroundColor: brand.accentColor }}
                    title="Accent"
                  />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* API Key Dialog */}
      <Dialog open={!!editApiKeyBrand} onOpenChange={() => setEditApiKeyBrand(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editApiKeyBrand?.klaviyoApiKey ? 'Update' : 'Add'} Klaviyo API Key
            </DialogTitle>
            <DialogDescription>
              Enter the private API key for {editApiKeyBrand?.name}. This will be used to create templates and campaigns.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="api-key">Private API Key</Label>
              <Input
                id="api-key"
                type="password"
                placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxx"
                value={apiKeyValue}
                onChange={(e) => setApiKeyValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Find this in Klaviyo → Settings → API Keys
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditApiKeyBrand(null)}>
              Cancel
            </Button>
            <Button onClick={handleSaveApiKey} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
