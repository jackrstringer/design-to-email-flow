import { useState, useCallback } from 'react';
import { Pencil, Copy, Check, Upload, X, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Brand } from '@/types/brand-assets';

interface BrandIdentitySectionProps {
  brand: Brand;
  onBrandChange: () => void;
}

export function BrandIdentitySection({ brand, onBrandChange }: BrandIdentitySectionProps) {
  const [editingColors, setEditingColors] = useState(false);
  const [primaryColor, setPrimaryColor] = useState(brand.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(brand.secondaryColor);
  const [accentColor, setAccentColor] = useState(brand.accentColor || '');
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState<'dark' | 'light' | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  const allColors = [
    { label: 'Primary', value: brand.primaryColor },
    { label: 'Secondary', value: brand.secondaryColor },
    brand.accentColor && { label: 'Accent', value: brand.accentColor },
    brand.backgroundColor && { label: 'Background', value: brand.backgroundColor },
    brand.textPrimaryColor && { label: 'Text', value: brand.textPrimaryColor },
    brand.linkColor && { label: 'Link', value: brand.linkColor },
  ].filter(Boolean) as { label: string; value: string }[];

  const copyLink = async (link: string) => {
    await navigator.clipboard.writeText(link);
    setCopiedLink(link);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleSaveColors = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('brands')
        .update({ 
          primary_color: primaryColor,
          secondary_color: secondaryColor,
          accent_color: accentColor || null,
        })
        .eq('id', brand.id);

      if (error) throw error;
      toast.success('Colors updated');
      setEditingColors(false);
      onBrandChange();
    } catch (error) {
      toast.error('Failed to update colors');
    } finally {
      setIsSaving(false);
    }
  };

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

      const { data, error } = await supabase.functions.invoke('upload-to-imagekit', {
        body: {
          imageData: base64,
          folder: `brands/${brand.domain}/logos`,
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
      onBrandChange();
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
      onBrandChange();
    } catch (error) {
      toast.error('Failed to remove logo');
    }
  }, [brand.id, onBrandChange]);

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Colors Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Colors</h3>
            {!editingColors && (
              <Button variant="ghost" size="sm" onClick={() => setEditingColors(true)} className="h-7 text-xs">
                <Pencil className="h-3 w-3 mr-1" />
                Edit
              </Button>
            )}
          </div>

          {editingColors ? (
            <div className="space-y-4">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Primary</Label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="color" 
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                    <Input 
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="flex-1 h-8 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Secondary</Label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="color" 
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                    <Input 
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="flex-1 h-8 text-xs font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Accent</Label>
                  <div className="flex items-center gap-2">
                    <input 
                      type="color" 
                      value={accentColor || '#000000'}
                      onChange={(e) => setAccentColor(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                    <Input 
                      value={accentColor}
                      onChange={(e) => setAccentColor(e.target.value)}
                      placeholder="Optional"
                      className="flex-1 h-8 text-xs font-mono"
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setEditingColors(false)}>Cancel</Button>
                <Button size="sm" onClick={handleSaveColors} disabled={isSaving}>Save</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {allColors.map((color) => (
                <div key={color.label} className="flex items-center gap-2">
                  <div 
                    className="w-6 h-6 rounded-md shadow-sm ring-1 ring-black/5" 
                    style={{ backgroundColor: color.value }} 
                  />
                  <div className="flex flex-col">
                    <span className="text-xs text-muted-foreground">{color.label}</span>
                    <span className="text-xs font-mono">{color.value}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Logos Card */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium">Logos</h3>
          </div>

          {/* Missing logo warning */}
          {(!brand.lightLogoUrl || !brand.darkLogoUrl) && (
            <div className="flex items-start gap-2 p-3 mb-4 bg-amber-50 border border-amber-200 rounded-lg">
              <Image className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800">
                {!brand.lightLogoUrl && !brand.darkLogoUrl 
                  ? 'Upload both dark and light logo versions'
                  : !brand.lightLogoUrl 
                    ? 'Upload a light logo for dark backgrounds'
                    : 'Upload a dark logo for light backgrounds'}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            {/* Dark Logo */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Dark (for light bg)</Label>
              {brand.darkLogoUrl ? (
                <div className="relative group rounded-lg border border-border/50 bg-white p-3 h-20 flex items-center justify-center">
                  <img 
                    src={brand.darkLogoUrl} 
                    alt="Dark logo" 
                    className="max-h-14 max-w-full object-contain"
                  />
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyLink(brand.darkLogoUrl!)}
                    >
                      {copiedLink === brand.darkLogoUrl ? (
                        <Check className="h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => handleLogoRemove('dark')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-20 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors">
                  {uploadingLogo === 'dark' ? (
                    <span className="text-xs text-amber-700">Uploading...</span>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 text-amber-600 mb-1" />
                      <span className="text-xs text-amber-700">Upload</span>
                    </>
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
            </div>

            {/* Light Logo */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Light (for dark bg)</Label>
              {brand.lightLogoUrl ? (
                <div className="relative group rounded-lg border border-border/50 bg-zinc-900 p-3 h-20 flex items-center justify-center">
                  <img 
                    src={brand.lightLogoUrl} 
                    alt="Light logo" 
                    className="max-h-14 max-w-full object-contain"
                  />
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => copyLink(brand.lightLogoUrl!)}
                    >
                      {copiedLink === brand.lightLogoUrl ? (
                        <Check className="h-3 w-3 text-green-600" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </Button>
                    <Button
                      variant="secondary"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => handleLogoRemove('light')}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-20 rounded-lg border-2 border-dashed border-amber-300 bg-zinc-900 cursor-pointer hover:bg-zinc-800 transition-colors">
                  {uploadingLogo === 'light' ? (
                    <span className="text-xs text-amber-400">Uploading...</span>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 text-amber-400 mb-1" />
                      <span className="text-xs text-amber-400">Upload</span>
                    </>
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
    </div>
  );
}
