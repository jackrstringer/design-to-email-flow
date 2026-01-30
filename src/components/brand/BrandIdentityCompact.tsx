import { Card, CardContent } from '@/components/ui/card';
import type { Brand } from '@/types/brand-assets';

interface BrandIdentityCompactProps {
  brand: Brand;
}

export function BrandIdentityCompact({ brand }: BrandIdentityCompactProps) {
  const colors = [
    { label: 'Primary', value: brand.primaryColor },
    { label: 'Secondary', value: brand.secondaryColor },
    brand.accentColor && { label: 'Accent', value: brand.accentColor },
    brand.backgroundColor && { label: 'Background', value: brand.backgroundColor },
  ].filter(Boolean) as { label: string; value: string }[];

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
          
          {/* Logo thumbnails */}
          <div className="flex items-center gap-3">
            {brand.darkLogoUrl && (
              <div className="h-10 px-3 bg-white rounded flex items-center">
                <img 
                  src={brand.darkLogoUrl} 
                  alt="Dark logo"
                  className="h-6 max-w-[80px] object-contain" 
                />
              </div>
            )}
            {brand.lightLogoUrl && (
              <div className="h-10 px-3 bg-zinc-900 rounded flex items-center">
                <img 
                  src={brand.lightLogoUrl} 
                  alt="Light logo"
                  className="h-6 max-w-[80px] object-contain" 
                />
              </div>
            )}
            {!brand.darkLogoUrl && !brand.lightLogoUrl && (
              <span className="text-xs text-muted-foreground">No logos uploaded</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
