import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ExternalLink, Image as ImageIcon } from 'lucide-react';
import { Campaign } from '@/types/brand-assets';

interface CampaignCardProps {
  campaign: Campaign;
  brandName?: string;
  brandDomain?: string;
  brandLogoUrl?: string;
  onClick?: () => void;
}

export const CampaignCard = ({ 
  campaign, 
  brandName,
  brandDomain,
  brandLogoUrl,
  onClick 
}: CampaignCardProps) => {
  const statusColors: Record<string, string> = {
    draft: 'bg-muted text-muted-foreground',
    completed: 'bg-success/10 text-success',
    pushed_to_klaviyo: 'bg-primary/10 text-primary',
  };

  const statusLabels: Record<string, string> = {
    draft: 'Draft',
    completed: 'Completed',
    pushed_to_klaviyo: 'In Klaviyo',
  };

  return (
    <Card 
      className="p-4 hover:shadow-md transition-shadow cursor-pointer border border-border"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          {brandLogoUrl ? (
            <img 
              src={brandLogoUrl} 
              alt={brandName} 
              className="w-8 h-8 object-contain rounded"
            />
          ) : campaign.thumbnailUrl ? (
            <img 
              src={campaign.thumbnailUrl} 
              alt={campaign.name} 
              className="w-8 h-8 object-cover rounded"
            />
          ) : (
            <div className="w-8 h-8 bg-muted rounded flex items-center justify-center">
              <ImageIcon className="w-4 h-4 text-muted-foreground" />
            </div>
          )}
          <div>
            <h3 className="font-medium text-foreground text-sm">{campaign.name}</h3>
            {brandDomain && (
              <p className="text-xs text-muted-foreground">{brandDomain}</p>
            )}
          </div>
        </div>
        <ExternalLink className="w-4 h-4 text-muted-foreground" />
      </div>

      {campaign.thumbnailUrl && (
        <div className="mb-3 rounded-lg overflow-hidden bg-muted">
          <img 
            src={campaign.thumbnailUrl} 
            alt={campaign.name}
            className="w-full h-32 object-cover"
          />
        </div>
      )}

      <div className="flex items-center justify-between">
        <Badge 
          variant="secondary" 
          className={statusColors[campaign.status]}
        >
          {statusLabels[campaign.status]}
        </Badge>
        <span className="text-xs text-muted-foreground">
          {new Date(campaign.createdAt).toLocaleDateString()}
        </span>
      </div>
    </Card>
  );
};
