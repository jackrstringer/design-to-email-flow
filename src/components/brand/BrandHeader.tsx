import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Brand } from '@/types/brand-assets';

interface BrandHeaderProps {
  brand: Brand;
  onBrandChange: () => void;
}

export function BrandHeader({ brand, onBrandChange }: BrandHeaderProps) {
  const navigate = useNavigate();
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleReanalyze = async () => {
    if (!brand.websiteUrl) {
      toast.error('No website URL to analyze');
      return;
    }

    setIsReanalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: { websiteUrl: brand.websiteUrl }
      });

      if (error) throw error;

      const updates: any = {};
      
      if (data?.colors) {
        updates.primary_color = data.colors.primary || brand.primaryColor;
        updates.secondary_color = data.colors.secondary || brand.secondaryColor;
        updates.accent_color = data.colors.accent || null;
        updates.background_color = data.colors.background || null;
        updates.text_primary_color = data.colors.textPrimary || null;
        updates.link_color = data.colors.link || null;
      }

      if (data?.typography || data?.fonts || data?.spacing || data?.components) {
        updates.typography = {
          ...(data.typography || {}),
          fonts: data.fonts || [],
          spacing: data.spacing || null,
          components: data.components || null,
        };
      }

      if (data?.socialLinks) {
        updates.social_links = data.socialLinks;
      }

      if (data?.allLinks) {
        updates.all_links = data.allLinks;
      }

      const { error: updateError } = await supabase
        .from('brands')
        .update(updates)
        .eq('id', brand.id);

      if (updateError) throw updateError;

      toast.success('Brand info refreshed');
      onBrandChange();
    } catch (error) {
      console.error('Error re-analyzing brand:', error);
      toast.error('Failed to re-analyze brand');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const handleDeleteBrand = async () => {
    if (!confirm(`Are you sure you want to delete "${brand.name}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('brands')
        .delete()
        .eq('id', brand.id);

      if (error) throw error;

      toast.success('Brand deleted');
      navigate('/brands');
    } catch (error) {
      console.error('Error deleting brand:', error);
      toast.error('Failed to delete brand');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/brands" className="inline-flex items-center text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-4 h-4 mr-2" />
        Back to Brands
      </Link>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div 
            className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-semibold text-lg"
            style={{ backgroundColor: brand.primaryColor }}
          >
            {brand.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-xl font-semibold">{brand.name}</h1>
            <p className="text-sm text-muted-foreground">{brand.domain}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleReanalyze}
            disabled={isReanalyzing || !brand.websiteUrl}
            className="text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isReanalyzing ? 'animate-spin' : ''}`} />
            {isReanalyzing ? 'Analyzing...' : 'Re-analyze'}
          </Button>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleDeleteBrand}
            disabled={isDeleting}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
    </div>
  );
}
