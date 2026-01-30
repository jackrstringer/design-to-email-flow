import { useState, useCallback } from 'react';
import { Upload, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Brand } from '@/types/brand-assets';

interface BrandIdentityCompactProps {
  brand: Brand;
  onBrandChange?: () => void;
}

export function BrandIdentityCompact({ brand, onBrandChange }: BrandIdentityCompactProps) {
  const [uploadingLogo, setUploadingLogo] = useState<'dark' | 'light' | null>(null);

  const colors = [
    { label: 'Primary', value: brand.primaryColor },
    { label: 'Secondary', value: brand.secondaryColor },
    brand.accentColor && { label: 'Accent', value: brand.accentColor },
    brand.backgroundColor && { label: 'Background', value: brand.backgroundColor },
  ].filter(Boolean) as { label: string; value: string }[];

  const handleLogoUpload = useCallback(async (file: File, type: 'dark' | 'light') => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setUploadingLogo(type);
    try {
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;

      const { data, error } = await supabase.functions.invoke('upload-to-cloudinary', {
        body: {
          imageData: base64,
          folder: `brands/${brand.domain}/logos`,
          publicId: `${type}-logo`,
        },
      });

      if (error) throw error;

      const updateFields = type === 'dark'
        ? { dark_logo_url: data.url, dark_logo_public_id: data.publicId }
        : { light_logo_url: data.url, light_logo_public_id: data.publicId };

      const { error: updateError } = await supabase
        .from('brands')
        .update(updateFields)
        .eq('id', brand.id);

      if (updateError) throw updateError;

      toast.success(`${type === 'dark' ? 'Dark' : 'Light'} logo uploaded`);
      onBrandChange?.();
    } catch (error) {
      console.error('Logo upload error:', error);
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(null);
    }
  }, [brand.id, brand.domain, onBrandChange]);

  const handleLogoRemove = useCallback(async (type: 'dark' | 'light') => {
    try {
      const updateFields = type === 'dark'
        ? { dark_logo_url: null, dark_logo_public_id: null }
        : { light_logo_url: null, light_logo_public_id: null };

      const { error } = await supabase
        .from('brands')
        .update(updateFields)
        .eq('id', brand.id);

      if (error) throw error;

      toast.success('Logo removed');
      onBrandChange?.();
    } catch (error) {
      toast.error('Failed to remove logo');
    }
  }, [brand.id, onBrandChange]);

  return (
    <Card className="bg-muted/30">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          {/* Color swatches row */}
          <div className="flex items-center gap-2">
            {colors.map(c => (
              <div 
                key={c.label}
                className="w-8 h-8 rounded-lg shadow-sm ring-1 ring-black/5" 
                style={{ backgroundColor: c.value }}
                title={c.label}
              />
            ))}
          </div>
          
          {/* Logo thumbnails with upload capability */}
          <div className="flex items-center gap-3">
            {/* Dark Logo */}
            {brand.darkLogoUrl ? (
              <div className="relative group h-10 px-3 bg-white rounded flex items-center">
                <img 
                  src={brand.darkLogoUrl} 
                  alt="Dark logo"
                  className="h-6 max-w-[80px] object-contain" 
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center gap-1">
                  <label className="cursor-pointer p-1 hover:bg-white/20 rounded">
                    <Upload className="h-3 w-3 text-white" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoUpload(file, 'dark');
                        e.target.value = '';
                      }}
                      disabled={uploadingLogo !== null}
                    />
                  </label>
                  <button 
                    onClick={() => handleLogoRemove('dark')}
                    className="p-1 hover:bg-white/20 rounded"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              </div>
            ) : (
              <label className="h-10 px-3 bg-white rounded flex items-center justify-center cursor-pointer hover:bg-muted/50 transition-colors border-2 border-dashed border-muted-foreground/30">
                {uploadingLogo === 'dark' ? (
                  <span className="text-xs text-muted-foreground">...</span>
                ) : (
                  <Upload className="h-4 w-4 text-muted-foreground" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file, 'dark');
                    e.target.value = '';
                  }}
                  disabled={uploadingLogo !== null}
                />
              </label>
            )}

            {/* Light Logo */}
            {brand.lightLogoUrl ? (
              <div className="relative group h-10 px-3 bg-zinc-900 rounded flex items-center">
                <img 
                  src={brand.lightLogoUrl} 
                  alt="Light logo"
                  className="h-6 max-w-[80px] object-contain" 
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center gap-1">
                  <label className="cursor-pointer p-1 hover:bg-white/20 rounded">
                    <Upload className="h-3 w-3 text-white" />
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoUpload(file, 'light');
                        e.target.value = '';
                      }}
                      disabled={uploadingLogo !== null}
                    />
                  </label>
                  <button 
                    onClick={() => handleLogoRemove('light')}
                    className="p-1 hover:bg-white/20 rounded"
                  >
                    <X className="h-3 w-3 text-white" />
                  </button>
                </div>
              </div>
            ) : (
              <label className="h-10 px-3 bg-zinc-900 rounded flex items-center justify-center cursor-pointer hover:bg-zinc-800 transition-colors border-2 border-dashed border-zinc-600">
                {uploadingLogo === 'light' ? (
                  <span className="text-xs text-zinc-400">...</span>
                ) : (
                  <Upload className="h-4 w-4 text-zinc-400" />
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file, 'light');
                    e.target.value = '';
                  }}
                  disabled={uploadingLogo !== null}
                />
              </label>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
