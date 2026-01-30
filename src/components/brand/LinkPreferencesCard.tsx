import { useState } from 'react';
import { Pencil, Loader2, Home, Layers, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useLinkPreferences } from '@/hooks/useLinkPreferences';
import type { BrandLinkPreferences } from '@/types/link-intelligence';
import { toast } from 'sonner';

interface LinkPreferencesCardProps {
  brandId: string;
}

export function LinkPreferencesCard({ brandId }: LinkPreferencesCardProps) {
  const { preferences, isLoading, updatePreferences, isUpdating } = useLinkPreferences(brandId);
  const [editOpen, setEditOpen] = useState(false);
  
  // Edit form state
  const [ctaBehavior, setCtaBehavior] = useState<BrandLinkPreferences['default_cta_behavior']>('campaign_context');
  const [collectionName, setCollectionName] = useState('');
  const [collectionUrl, setCollectionUrl] = useState('');
  const [catalogSize, setCatalogSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [productChurn, setProductChurn] = useState<'low' | 'medium' | 'high'>('medium');

  const openEdit = () => {
    if (preferences) {
      setCtaBehavior(preferences.default_cta_behavior || 'campaign_context');
      setCollectionName(preferences.primary_collection_name || '');
      setCollectionUrl(preferences.primary_collection_url || '');
      setCatalogSize(preferences.catalog_size || 'medium');
      setProductChurn(preferences.product_churn || 'medium');
    }
    setEditOpen(true);
  };

  const handleSave = async () => {
    try {
      await updatePreferences({
        default_cta_behavior: ctaBehavior,
        primary_collection_name: ctaBehavior === 'primary_collection' ? collectionName : undefined,
        primary_collection_url: ctaBehavior === 'primary_collection' ? collectionUrl : undefined,
        catalog_size: catalogSize,
        product_churn: productChurn,
      });
      toast.success('Link preferences updated');
      setEditOpen(false);
    } catch (error) {
      toast.error('Failed to update preferences');
    }
  };

  const getCtaBehaviorLabel = (behavior?: string) => {
    switch (behavior) {
      case 'homepage':
        return 'Links to homepage';
      case 'primary_collection':
        return 'Links to primary collection';
      case 'campaign_context':
        return 'Matches campaign context';
      default:
        return 'Not configured';
    }
  };

  const getCatalogSizeLabel = (size?: string) => {
    switch (size) {
      case 'small':
        return 'Small (< 50 products)';
      case 'medium':
        return 'Medium (50-500 products)';
      case 'large':
        return 'Large (500+ products)';
      default:
        return 'Not set';
    }
  };

  const getProductChurnLabel = (churn?: string) => {
    switch (churn) {
      case 'low':
        return 'Rarely (stable catalog)';
      case 'medium':
        return 'Monthly updates';
      case 'high':
        return 'Weekly+ updates';
      default:
        return 'Not set';
    }
  };

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border border-border/50 bg-muted/30">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <>
      <div className="p-4 rounded-lg border border-border/50 bg-muted/30 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Link Preferences</span>
          <Button size="sm" variant="ghost" onClick={openEdit}>
            <Pencil className="w-3 h-3 mr-1" />
            Edit
          </Button>
        </div>

        <div className="grid gap-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Default CTA:</span>
            <span>{getCtaBehaviorLabel(preferences?.default_cta_behavior)}</span>
          </div>
          {preferences?.default_cta_behavior === 'primary_collection' && preferences?.primary_collection_name && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Collection:</span>
              <span>{preferences.primary_collection_name}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Catalog:</span>
            <span>{getCatalogSizeLabel(preferences?.catalog_size)}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Updates:</span>
            <span>{getProductChurnLabel(preferences?.product_churn)}</span>
          </div>
        </div>
      </div>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Link Preferences</DialogTitle>
            <DialogDescription>
              Configure how generic CTAs like "Shop Now" should be linked.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* CTA Behavior */}
            <div className="space-y-3">
              <Label>Default CTA Behavior</Label>
              <RadioGroup 
                value={ctaBehavior} 
                onValueChange={(v) => setCtaBehavior(v as BrandLinkPreferences['default_cta_behavior'])}
              >
                <div className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                  <RadioGroupItem value="homepage" id="homepage" className="mt-1" />
                  <div className="flex-1">
                    <label htmlFor="homepage" className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                      <Home className="w-4 h-4" />
                      Always to homepage
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Generic buttons go to the brand's homepage
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                  <RadioGroupItem value="primary_collection" id="primary_collection" className="mt-1" />
                  <div className="flex-1">
                    <label htmlFor="primary_collection" className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                      <Layers className="w-4 h-4" />
                      To a primary collection
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Generic buttons go to a specific collection page
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 rounded-lg border border-border/50 hover:bg-muted/30 transition-colors">
                  <RadioGroupItem value="campaign_context" id="campaign_context" className="mt-1" />
                  <div className="flex-1">
                    <label htmlFor="campaign_context" className="flex items-center gap-2 text-sm font-medium cursor-pointer">
                      <Lightbulb className="w-4 h-4" />
                      Depends on campaign
                    </label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Link to whatever product or collection the email highlights
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Collection inputs (conditional) */}
            {ctaBehavior === 'primary_collection' && (
              <div className="space-y-3 pl-4 border-l-2 border-primary/20">
                <div className="space-y-2">
                  <Label>Collection Name</Label>
                  <Input
                    placeholder="e.g., New Arrivals"
                    value={collectionName}
                    onChange={(e) => setCollectionName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Collection URL</Label>
                  <Input
                    placeholder="/collections/new-arrivals"
                    value={collectionUrl}
                    onChange={(e) => setCollectionUrl(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Catalog Size */}
            <div className="space-y-2">
              <Label>Catalog Size</Label>
              <Select value={catalogSize} onValueChange={(v) => setCatalogSize(v as 'small' | 'medium' | 'large')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small (under 50 products)</SelectItem>
                  <SelectItem value="medium">Medium (50-500 products)</SelectItem>
                  <SelectItem value="large">Large (500+ products)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Product Churn */}
            <div className="space-y-2">
              <Label>Product Updates</Label>
              <Select value={productChurn} onValueChange={(v) => setProductChurn(v as 'low' | 'medium' | 'high')}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Rarely — mostly same products</SelectItem>
                  <SelectItem value="medium">Sometimes — new products monthly</SelectItem>
                  <SelectItem value="high">Frequently — new products weekly+</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isUpdating}>
              {isUpdating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
