import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { ExternalLink, Image as ImageIcon } from 'lucide-react';
import { Brand } from '@/types/brand-assets';

interface BrandCardProps {
  brand: Brand;
  campaignCount?: number;
}

export const BrandCard = ({ brand, campaignCount = 0 }: BrandCardProps) => {
  return (
    <Link to={`/brands/${brand.id}`}>
      <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer border border-border">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {brand.darkLogoUrl ? (
              <img 
                src={brand.darkLogoUrl} 
                alt={brand.name} 
                className="w-10 h-10 object-contain rounded"
              />
            ) : (
              <div className="w-10 h-10 bg-muted rounded flex items-center justify-center">
                <ImageIcon className="w-5 h-5 text-muted-foreground" />
              </div>
            )}
            <div>
              <h3 className="font-medium text-foreground">{brand.name}</h3>
              <p className="text-sm text-muted-foreground">{brand.domain}</p>
            </div>
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </div>

        <div className="flex items-center gap-2 mb-3">
          <div 
            className="w-4 h-4 rounded-full border border-border" 
            style={{ backgroundColor: brand.primaryColor }}
          />
          <div 
            className="w-4 h-4 rounded-full border border-border" 
            style={{ backgroundColor: brand.secondaryColor }}
          />
          {brand.accentColor && (
            <div 
              className="w-4 h-4 rounded-full border border-border" 
              style={{ backgroundColor: brand.accentColor }}
            />
          )}
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {campaignCount} campaign{campaignCount !== 1 ? 's' : ''}
          </span>
          <span className="text-xs text-muted-foreground">
            {new Date(brand.createdAt).toLocaleDateString()}
          </span>
        </div>
      </Card>
    </Link>
  );
};
