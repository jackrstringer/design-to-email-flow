import { useState } from 'react';
import { Trash2, Plus, Loader2, ExternalLink, Save, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
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

interface LinkPreferencesManageViewProps {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LinkPreferencesManageView({
  brandId,
  open,
  onOpenChange,
}: LinkPreferencesManageViewProps) {
  const { preferences, updatePreferences, isUpdating } = useLinkPreferences(brandId);
  
  // Form state
  const [defaultDestinationUrl, setDefaultDestinationUrl] = useState('');
  const [defaultDestinationName, setDefaultDestinationName] = useState('');
  const [rules, setRules] = useState<LinkRoutingRule[]>([]);
  const [catalogSize, setCatalogSize] = useState<'small' | 'medium' | 'large'>('medium');
  const [productChurn, setProductChurn] = useState<'low' | 'medium' | 'high'>('medium');
  
  // Add rule state
  const [showAddRule, setShowAddRule] = useState(false);
  const [newRuleName, setNewRuleName] = useState('');
  const [newRuleKeywords, setNewRuleKeywords] = useState('');
  const [newRuleUrl, setNewRuleUrl] = useState('');
  
  // Edit rule state
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [editRuleName, setEditRuleName] = useState('');
  const [editRuleKeywords, setEditRuleKeywords] = useState('');
  const [editRuleUrl, setEditRuleUrl] = useState('');

  const [hasChanges, setHasChanges] = useState(false);

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  // Sync state when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen && preferences) {
      setDefaultDestinationUrl(preferences.default_destination_url || '');
      setDefaultDestinationName(preferences.default_destination_name || '');
      setRules(preferences.rules || []);
      setCatalogSize(preferences.catalog_size || 'medium');
      setProductChurn(preferences.product_churn || 'medium');
      setHasChanges(false);
    }
    onOpenChange(newOpen);
  };

  const markChanged = () => setHasChanges(true);

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
    setNewRuleName('');
    setNewRuleKeywords('');
    setNewRuleUrl('');
    setShowAddRule(false);
    markChanged();
    toast.success('Rule added');
  };

  const handleEditRule = (rule: LinkRoutingRule) => {
    setEditingRuleId(rule.id);
    setEditRuleName(rule.name);
    setEditRuleKeywords(rule.keywords.join(', '));
    setEditRuleUrl(rule.destination_url);
  };

  const handleSaveEditRule = () => {
    if (!editRuleName.trim()) {
      toast.error('Rule name is required');
      return;
    }
    const keywords = editRuleKeywords.split(',').map(k => k.trim()).filter(Boolean);
    if (keywords.length === 0) {
      toast.error('At least one keyword is required');
      return;
    }
    if (!editRuleUrl.trim() || !isValidUrl(editRuleUrl)) {
      toast.error('Valid URL is required (include https://)');
      return;
    }

    setRules(rules.map(r => 
      r.id === editingRuleId 
        ? { ...r, name: editRuleName.trim(), keywords, destination_url: editRuleUrl.trim() }
        : r
    ));
    setEditingRuleId(null);
    markChanged();
    toast.success('Rule updated');
  };

  const handleCancelEdit = () => {
    setEditingRuleId(null);
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules(rules.filter(r => r.id !== ruleId));
    markChanged();
  };

  const handleSaveAll = async () => {
    if (defaultDestinationUrl && !isValidUrl(defaultDestinationUrl)) {
      toast.error('Please enter a valid default destination URL');
      return;
    }

    try {
      await updatePreferences({
        default_destination_url: defaultDestinationUrl || undefined,
        default_destination_name: defaultDestinationName || undefined,
        rules: rules.length > 0 ? rules : undefined,
        catalog_size: catalogSize,
        product_churn: productChurn,
      });
      toast.success('Preferences saved');
      setHasChanges(false);
      onOpenChange(false);
    } catch (error) {
      toast.error('Failed to save preferences');
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Link Preferences</DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Default Destination Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Default Destination
            </h4>
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Name (optional)</Label>
                <Input
                  placeholder="e.g., Main Landing Page"
                  value={defaultDestinationName}
                  onChange={(e) => { setDefaultDestinationName(e.target.value); markChanged(); }}
                />
              </div>
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  placeholder="https://yourbrand.com/pages/main-lp"
                  value={defaultDestinationUrl}
                  onChange={(e) => { setDefaultDestinationUrl(e.target.value); markChanged(); }}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Rules Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Routing Rules
            </h4>

            {rules.length === 0 && !showAddRule ? (
              <p className="text-sm text-muted-foreground italic py-2">
                No rules configured. All generic CTAs will go to your default destination.
              </p>
            ) : (
              <div className="space-y-2">
                {rules.map(rule => (
                  <div key={rule.id}>
                    {editingRuleId === rule.id ? (
                      <div className="p-3 rounded-lg border border-primary bg-primary/5 space-y-3">
                        <div className="space-y-2">
                          <Label className="text-xs">Name</Label>
                          <Input
                            value={editRuleName}
                            onChange={(e) => setEditRuleName(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Keywords</Label>
                          <Input
                            value={editRuleKeywords}
                            onChange={(e) => setEditRuleKeywords(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label className="text-xs">Destination URL</Label>
                          <Input
                            value={editRuleUrl}
                            onChange={(e) => setEditRuleUrl(e.target.value)}
                            className="h-8"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="ghost" size="sm" onClick={handleCancelEdit}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={handleSaveEditRule}>
                            Save Rule
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-3 rounded-lg border border-border/50 bg-muted/30 space-y-1">
                        <div className="flex items-start justify-between">
                          <span className="font-medium text-sm">{rule.name}</span>
                          <div className="flex gap-1">
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-6 px-2 text-xs"
                              onClick={() => handleEditRule(rule)}
                            >
                              Edit
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              onClick={() => handleDeleteRule(rule.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Keywords: {rule.keywords.join(', ')}
                        </p>
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          → {rule.destination_url}
                          <a 
                            href={rule.destination_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="hover:text-foreground"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {showAddRule ? (
              <div className="p-3 rounded-lg border border-primary bg-primary/5 space-y-3">
                <div className="space-y-2">
                  <Label className="text-xs">Rule Name</Label>
                  <Input
                    placeholder="e.g., Protein campaigns"
                    value={newRuleName}
                    onChange={(e) => setNewRuleName(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Keywords</Label>
                  <Input
                    placeholder="protein, whey, mass gainer"
                    value={newRuleKeywords}
                    onChange={(e) => setNewRuleKeywords(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Destination URL</Label>
                  <Input
                    placeholder="https://store.com/pages/protein-lp"
                    value={newRuleUrl}
                    onChange={(e) => setNewRuleUrl(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" size="sm" onClick={() => {
                    setShowAddRule(false);
                    setNewRuleName('');
                    setNewRuleKeywords('');
                    setNewRuleUrl('');
                  }}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleAddRule}>
                    Add Rule
                  </Button>
                </div>
              </div>
            ) : (
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => setShowAddRule(true)}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add Rule
              </Button>
            )}
          </div>

          <Separator />

          {/* Catalog Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
              Catalog Information
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Catalog Size</Label>
                <Select 
                  value={catalogSize} 
                  onValueChange={(v) => { setCatalogSize(v as 'small' | 'medium' | 'large'); markChanged(); }}
                >
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
                <Select 
                  value={productChurn} 
                  onValueChange={(v) => { setProductChurn(v as 'low' | 'medium' | 'high'); markChanged(); }}
                >
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

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSaveAll} disabled={isUpdating}>
            {isUpdating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
