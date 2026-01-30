import { useState } from 'react';
import { Settings, ArrowRight, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLinkPreferences } from '@/hooks/useLinkPreferences';
import { LinkPreferencesWizard } from './LinkPreferencesWizard';
import { LinkPreferencesManageView } from './LinkPreferencesManageView';

interface LinkPreferencesCardProps {
  brandId: string;
}

export function LinkPreferencesCard({ brandId }: LinkPreferencesCardProps) {
  const { preferences, isLoading, refetch } = useLinkPreferences(brandId);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);

  // Check if preferences are configured
  const isConfigured = Boolean(
    preferences?.default_destination_url || 
    (preferences?.rules && preferences.rules.length > 0)
  );

  const getCatalogSizeLabel = (size?: string) => {
    switch (size) {
      case 'small': return 'Small';
      case 'medium': return 'Medium';
      case 'large': return 'Large';
      default: return 'Not set';
    }
  };

  const getProductChurnLabel = (churn?: string) => {
    switch (churn) {
      case 'low': return 'Rarely';
      case 'medium': return 'Sometimes';
      case 'high': return 'Frequently';
      default: return 'Not set';
    }
  };

  const shortenUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.pathname.length > 30 
        ? parsed.pathname.substring(0, 30) + '...' 
        : parsed.pathname;
    } catch {
      return url.length > 40 ? url.substring(0, 40) + '...' : url;
    }
  };

  const handleWizardComplete = () => {
    refetch();
  };

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border border-border/50 bg-muted/30">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Not configured state
  if (!isConfigured) {
    return (
      <>
        <div className="p-4 rounded-lg border border-border/50 bg-muted/30 space-y-3">
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium">Link Preferences</span>
          </div>
          
          <p className="text-sm text-muted-foreground">
            Not set up yet. I need to know where to send traffic from your campaigns.
          </p>
          
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setWizardOpen(true)}
            className="w-full"
          >
            Set up link preferences
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>

        <LinkPreferencesWizard
          brandId={brandId}
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          onComplete={handleWizardComplete}
        />
      </>
    );
  }

  // Configured state
  const rulesCount = preferences?.rules?.length || 0;

  return (
    <>
      <div className="p-4 rounded-lg border border-border/50 bg-muted/30 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Link Preferences</span>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setManageOpen(true)}>
              Edit
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setWizardOpen(true)}>
              Reconfigure
            </Button>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          {/* Default Destination */}
          <div>
            <span className="text-muted-foreground">Default: </span>
            {preferences?.default_destination_url ? (
              <span>
                {preferences.default_destination_name || 'Custom URL'}
                <a 
                  href={preferences.default_destination_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="ml-1 text-muted-foreground hover:text-foreground inline-flex items-center"
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              </span>
            ) : (
              <span className="text-muted-foreground italic">Not configured</span>
            )}
          </div>

          {/* Rules */}
          <div>
            <span className="text-muted-foreground">Rules: </span>
            {rulesCount > 0 ? (
              <span>{rulesCount}</span>
            ) : (
              <span className="text-muted-foreground italic">None</span>
            )}
          </div>
          {rulesCount > 0 && (
            <ul className="ml-4 space-y-0.5">
              {preferences?.rules?.slice(0, 3).map(rule => (
                <li key={rule.id} className="text-muted-foreground">
                  • {rule.name} → {shortenUrl(rule.destination_url)}
                </li>
              ))}
              {rulesCount > 3 && (
                <li className="text-muted-foreground italic">
                  + {rulesCount - 3} more
                </li>
              )}
            </ul>
          )}

          {/* Catalog Info */}
          <div className="pt-1">
            <span className="text-muted-foreground">Catalog: </span>
            <span>{getCatalogSizeLabel(preferences?.catalog_size)}</span>
            <span className="text-muted-foreground"> • Updates: </span>
            <span>{getProductChurnLabel(preferences?.product_churn)}</span>
          </div>
        </div>
      </div>

      <LinkPreferencesWizard
        brandId={brandId}
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onComplete={handleWizardComplete}
        existingPreferences={preferences || undefined}
      />

      <LinkPreferencesManageView
        brandId={brandId}
        open={manageOpen}
        onOpenChange={setManageOpen}
      />
    </>
  );
}
