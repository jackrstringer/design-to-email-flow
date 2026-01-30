import { useState } from 'react';
import { Pencil, Loader2, Plus, Trash2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { Separator } from '@/components/ui/separator';
import { useLinkPreferences } from '@/hooks/useLinkPreferences';
import type { BrandLinkPreferences, LinkRoutingRule } from '@/types/link-intelligence';
import { toast } from 'sonner';

interface LinkPreferencesCardProps {
  brandId: string;
}

export function LinkPreferencesCard({ brandId }: LinkPreferencesCardProps) {
  const { preferences, isLoading, updatePreferences, isUpdating } = useLinkPreferences(brandId);
  const [editOpen, setEditOpen] = useState(false);
  const [addRuleOpen, setAddRuleOpen] = useState(false);
  
  // Edit form state
  const [defaultDestinationUrl, setDefaultDestinationUrl] = useState('');
  const [defaultDestinationName, setDefaultDestinationName] = useState('');
  const [rules, setRules] = useState<LinkRoutingRule[]>([]);
  const [catalogSize, setCatalogSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [productChurn, setProductChurn] = useState<'low' | 'medium' | 'high'>('medium');

  // Add rule form state
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleKeywords, setNewRuleKeywords] = useState('');
  const [newRuleUrl, setNewRuleUrl] = useState('');

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const openEdit = () => {
    if (preferences) {
      // Migrate legacy structure if present
      if (preferences.default_cta_behavior && !preferences.default_destination_url) {
        if (preferences.default_cta_behavior === 'primary_collection' && preferences.primary_collection_url) {
          setDefaultDestinationUrl(preferences.primary_collection_url);
          setDefaultDestinationName(preferences.primary_collection_name || '');
        } else if (preferences.default_cta_behavior === 'homepage') {
          setDefaultDestinationUrl('');
          setDefaultDestinationName('Homepage');
        } else {
          setDefaultDestinationUrl('');
          setDefaultDestinationName('');
        }
      } else {
        setDefaultDestinationUrl(preferences.default_destination_url || '');
        setDefaultDestinationName(preferences.default_destination_name || '');
      }
      
      setRules(preferences.rules || []);
      setCatalogSize(preferences.catalog_size || 'medium');
      setProductChurn(preferences.product_churn || 'medium');
    }
    setEditOpen(true);
  };

  const resetRuleForm = () => {
    setNewRuleName('');
    setNewRuleKeywords('');
    setNewRuleUrl('');
  };

  const handleAddRule = () => {
    if (!newRuleName.trim()) {
      toast.error('Rule name is required');
      return;
    }
    const keywords = newRuleKeywords.split(',').map(k => k.trim()).filter(Boolean);
    if (keywords.length === 0) {
      toast.error('At least one keyword is required');
      return;
    }
    if (!newRuleUrl.trim() || !isValidUrl(newRuleUrl)) {
      toast.error('Valid URL is required (include https://)');
      return;
    }
    
    const newRule: LinkRoutingRule = {
      id: crypto.randomUUID(),
      name: newRuleName.trim(),
      keywords,
      destination_url: newRuleUrl.trim(),
    };
    
    setRules([...rules, newRule]);
    setAddRuleOpen(false);
    resetRuleForm();
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules(rules.filter(r => r.id !== ruleId));
  };

  const handleSave = async () => {
    try {
      await updatePreferences({
        default_destination_url: defaultDestinationUrl || undefined,
        default_destination_name: defaultDestinationName || undefined,
        rules: rules.length > 0 ? rules : undefined,
        catalog_size: catalogSize,
        product_churn: productChurn,
        // Clear legacy fields
        default_cta_behavior: undefined,
        primary_collection_name: undefined,
        primary_collection_url: undefined,
      });
      toast.success('Link preferences updated');
      setEditOpen(false);
    } catch (error) {
      toast.error('Failed to update preferences');
    }
  };

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

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border border-border/50 bg-muted/30">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const rulesCount = preferences?.rules?.length || 0;

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

        <div className="space-y-2 text-sm">
          {/* Default Destination */}
          <div>
            <span className="text-muted-foreground">Default destination: </span>
            {preferences?.default_destination_url ? (
              <span>
                {preferences.default_destination_name || 'Custom URL'}
                <a 
                  href={preferences.default_destination_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="ml-1 text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="w-3 h-3 inline" />
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
              <span>{rulesCount} configured</span>
            ) : (
              <span className="text-muted-foreground italic">None — all generic CTAs go to default</span>
            )}
          </div>
          {rulesCount > 0 && (
            <ul className="ml-4 space-y-0.5">
              {preferences?.rules?.map(rule => (
                <li key={rule.id} className="text-muted-foreground">
                  • {rule.name} → {shortenUrl(rule.destination_url)}
                </li>
              ))}
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

      {/* Edit Modal */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Link Preferences</DialogTitle>
            <DialogDescription>
              Configure where generic CTAs should link
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-4">
            {/* Section 1: Default Destination */}
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  Default Destination
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Where generic CTAs link when no rule matches
                </p>
              </div>
              
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Name (optional)</Label>
                  <Input
                    placeholder="e.g., Main Landing Page"
                    value={defaultDestinationName}
                    onChange={(e) => setDefaultDestinationName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>URL</Label>
                  <Input
                    placeholder="https://yourbrand.com/pages/main-lp"
                    value={defaultDestinationUrl}
                    onChange={(e) => setDefaultDestinationUrl(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <Separator />

            {/* Section 2: Conditional Rules */}
            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                  Conditional Rules
                </h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Route specific campaigns to dedicated pages. First match wins.
                </p>
              </div>

              {rules.length === 0 ? (
                <p className="text-sm text-muted-foreground italic py-2">
                  No rules configured. Generic CTAs will always go to your default destination.
                </p>
              ) : (
                <div className="space-y-2">
                  {rules.map(rule => (
                    <div 
                      key={rule.id} 
                      className="p-3 rounded-lg border border-border/50 bg-background space-y-1"
                    >
                      <div className="flex items-start justify-between">
                        <span className="font-medium text-sm">{rule.name}</span>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Keywords: {rule.keywords.join(', ')}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        → {rule.destination_url}
                      </p>
                    </div>
                  ))}
                </div>
              )}

              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => setAddRuleOpen(true)}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Rule
              </Button>
            </div>

            <Separator />

            {/* Section 3: Catalog Information */}
            <div className="space-y-3">
              <h4 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
                Catalog Information
              </h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Catalog Size</Label>
                  <Select value={catalogSize} onValueChange={(v) => setCatalogSize(v as 'small' | 'medium' | 'large')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="small">Small (&lt;50)</SelectItem>
                      <SelectItem value="medium">Medium (50-500)</SelectItem>
                      <SelectItem value="large">Large (500+)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="space-y-2">
                  <Label>Product Updates</Label>
                  <Select value={productChurn} onValueChange={(v) => setProductChurn(v as 'low' | 'medium' | 'high')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Rarely</SelectItem>
                      <SelectItem value="medium">Sometimes</SelectItem>
                      <SelectItem value="high">Frequently</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
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
                'Save Preferences'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Rule Modal */}
      <Dialog open={addRuleOpen} onOpenChange={(open) => {
        setAddRuleOpen(open);
        if (!open) resetRuleForm();
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Routing Rule</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Rule Name *</Label>
              <Input
                placeholder="e.g., Protein Campaigns"
                value={newRuleName}
                onChange={(e) => setNewRuleName(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">A label for your reference</p>
            </div>

            <div className="space-y-2">
              <Label>Keywords *</Label>
              <Input
                placeholder="protein, whey, mass gainer"
                value={newRuleKeywords}
                onChange={(e) => setNewRuleKeywords(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated. If any keyword appears in the campaign, this rule triggers.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Destination URL *</Label>
              <Input
                placeholder="https://store.com/pages/protein-lp"
                value={newRuleUrl}
                onChange={(e) => setNewRuleUrl(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Where generic CTAs should link for matching campaigns
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setAddRuleOpen(false);
              resetRuleForm();
            }}>
              Cancel
            </Button>
            <Button onClick={handleAddRule}>
              Add Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
