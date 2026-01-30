import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useLinkPreferences } from '@/hooks/useLinkPreferences';
import { toast } from 'sonner';

interface LinkPreferencesEditorProps {
  brandId: string;
}

interface RuleState {
  id: string;
  name: string;
  url: string;
}

export function LinkPreferencesEditor({ brandId }: LinkPreferencesEditorProps) {
  const { preferences, updatePreferences, isUpdating, isLoading } = useLinkPreferences(brandId);
  
  const [generalUrl, setGeneralUrl] = useState('');
  const [rules, setRules] = useState<RuleState[]>([]);
  const [hasChanges, setHasChanges] = useState(false);

  // Sync from preferences on load
  useEffect(() => {
    if (preferences) {
      setGeneralUrl(preferences.default_destination_url || '');
      setRules(preferences.rules?.map(r => ({
        id: r.id,
        name: r.name,
        url: r.destination_url
      })) || []);
      setHasChanges(false);
    }
  }, [preferences]);

  const updateGeneralUrl = (value: string) => {
    setGeneralUrl(value);
    setHasChanges(true);
  };

  const updateRule = (id: string, field: 'name' | 'url', value: string) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
    setHasChanges(true);
  };

  const addRule = () => {
    setRules(prev => [...prev, { id: crypto.randomUUID(), name: '', url: '' }]);
  };

  const removeRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
    setHasChanges(true);
  };

  const handleSave = async () => {
    // Filter out empty rules
    const validRules = rules.filter(r => r.name.trim() && r.url.trim());

    try {
      await updatePreferences({
        default_destination_url: generalUrl.trim() || undefined,
        rules: validRules.map(r => ({
          id: r.id,
          name: r.name.trim(),
          destination_url: r.url.trim()
        }))
      });

      setHasChanges(false);
      toast.success('Saved');
    } catch (error) {
      toast.error('Failed to save preferences');
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Link Preferences</CardTitle>
          {hasChanges && (
            <Button size="sm" onClick={handleSave} disabled={isUpdating}>
              {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* General Highlight URL */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            General Highlight URL
          </Label>
          <Input
            placeholder="https://brand.com/pages/main-landing"
            value={generalUrl}
            onChange={(e) => updateGeneralUrl(e.target.value)}
          />
        </div>

        {/* Product-Specific Links */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground uppercase tracking-wide">
            Product-Specific Links
          </Label>
          <div className="space-y-2">
            {rules.map((rule) => (
              <div key={rule.id} className="flex gap-2">
                <Input
                  placeholder="Product name"
                  value={rule.name}
                  onChange={(e) => updateRule(rule.id, 'name', e.target.value)}
                  className="flex-1"
                />
                <Input
                  placeholder="https://..."
                  value={rule.url}
                  onChange={(e) => updateRule(rule.id, 'url', e.target.value)}
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => removeRule(rule.id)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            ))}

            {/* Empty row for adding */}
            <div className="flex gap-2">
              <Input
                placeholder="Product name"
                onFocus={addRule}
                className="flex-1"
              />
              <Input
                placeholder="https://..."
                disabled
                className="flex-1"
              />
              <div className="w-9" />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
