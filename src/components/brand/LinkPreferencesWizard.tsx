import { useState } from 'react';
import { Link2, Check, ArrowRight, ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useLinkPreferences } from '@/hooks/useLinkPreferences';
import type { BrandLinkPreferences, LinkRoutingRule } from '@/types/link-intelligence';
import { toast } from 'sonner';

type WizardStep = 'welcome' | 'default-destination' | 'default-destination-url' | 'routing-choice' | 'add-rules' | 'catalog' | 'complete';

interface LinkPreferencesWizardProps {
  brandId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
  existingPreferences?: BrandLinkPreferences;
}

export function LinkPreferencesWizard({
  brandId,
  open,
  onOpenChange,
  onComplete,
  existingPreferences,
}: LinkPreferencesWizardProps) {
  const { updatePreferences } = useLinkPreferences(brandId);
  
  // Wizard state
  const [step, setStep] = useState<WizardStep>('welcome');
  const [usesHomepage, setUsesHomepage] = useState<boolean | null>(null);
  const [defaultDestinationUrl, setDefaultDestinationUrl] = useState(existingPreferences?.default_destination_url || '');
  const [defaultDestinationName, setDefaultDestinationName] = useState(existingPreferences?.default_destination_name || '');
  const [wantsRules, setWantsRules] = useState<boolean | null>(null);
  const [rules, setRules] = useState<LinkRoutingRule[]>(existingPreferences?.rules || []);
  const [catalogSize, setCatalogSize] = useState<'small' | 'medium' | 'large'>(existingPreferences?.catalog_size || 'medium');
  const [productChurn, setProductChurn] = useState<'low' | 'medium' | 'high'>(existingPreferences?.product_churn || 'medium');
  const [isSaving, setIsSaving] = useState(false);

  // Current rule being added
  const [currentRuleName, setCurrentRuleName] = useState('');
  const [currentRuleKeywords, setCurrentRuleKeywords] = useState('');
  const [currentRuleUrl, setCurrentRuleUrl] = useState('');

  const isValidUrl = (url: string) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const stepIndex: Record<WizardStep, number> = {
    'welcome': 0,
    'default-destination': 1,
    'default-destination-url': 1,
    'routing-choice': 2,
    'add-rules': 2,
    'catalog': 3,
    'complete': 3,
  };

  const handleNext = () => {
    switch (step) {
      case 'welcome':
        setStep('default-destination');
        break;
      case 'default-destination':
        // This step now handled by button clicks directly
        break;
      case 'default-destination-url':
        if (!defaultDestinationUrl.trim()) {
          toast.error('Please enter a destination URL');
          return;
        }
        if (!isValidUrl(defaultDestinationUrl)) {
          toast.error('Please enter a valid URL (include https://)');
          return;
        }
        setStep('routing-choice');
        break;
      case 'routing-choice':
        if (wantsRules === null) {
          toast.error('Please select an option');
          return;
        }
        if (wantsRules) {
          setStep('add-rules');
        } else {
          setStep('catalog');
        }
        break;
      case 'add-rules':
        // If there's a rule in progress, try to save it first
        if (currentRuleName.trim() || currentRuleKeywords.trim() || currentRuleUrl.trim()) {
          if (!addCurrentRule()) return;
        }
        setStep('catalog');
        break;
      case 'catalog':
        handleFinish();
        break;
    }
  };

  const handleBack = () => {
    switch (step) {
      case 'default-destination':
        setStep('welcome');
        break;
      case 'default-destination-url':
        setStep('default-destination');
        break;
      case 'routing-choice':
        if (usesHomepage) {
          setStep('default-destination');
        } else {
          setStep('default-destination-url');
        }
        break;
      case 'add-rules':
        setStep('routing-choice');
        break;
      case 'catalog':
        if (wantsRules) {
          setStep('add-rules');
        } else {
          setStep('routing-choice');
        }
        break;
    }
  };

  const handleHomepageChoice = () => {
    setUsesHomepage(true);
    setDefaultDestinationUrl('');
    setDefaultDestinationName('Homepage');
    setStep('routing-choice');
  };

  const handleSomewhereElseChoice = () => {
    setUsesHomepage(false);
    setStep('default-destination-url');
  };

  const addCurrentRule = (): boolean => {
    if (!currentRuleName.trim()) {
      toast.error('Rule name is required');
      return false;
    }
    const keywords = currentRuleKeywords.split(',').map(k => k.trim()).filter(Boolean);
    if (keywords.length === 0) {
      toast.error('At least one keyword is required');
      return false;
    }
    if (!currentRuleUrl.trim() || !isValidUrl(currentRuleUrl)) {
      toast.error('Valid URL is required (include https://)');
      return false;
    }

    const newRule: LinkRoutingRule = {
      id: crypto.randomUUID(),
      name: currentRuleName.trim(),
      keywords,
      destination_url: currentRuleUrl.trim(),
    };

    setRules([...rules, newRule]);
    setCurrentRuleName('');
    setCurrentRuleKeywords('');
    setCurrentRuleUrl('');
    return true;
  };

  const handleAddAnotherRule = () => {
    if (addCurrentRule()) {
      toast.success('Rule added');
    }
  };

  const handleDeleteRule = (ruleId: string) => {
    setRules(rules.filter(r => r.id !== ruleId));
  };

  const handleFinish = async () => {
    setIsSaving(true);
    try {
      await updatePreferences({
        default_destination_url: defaultDestinationUrl || undefined,
        default_destination_name: defaultDestinationName || undefined,
        rules: rules.length > 0 ? rules : undefined,
        catalog_size: catalogSize,
        product_churn: productChurn,
      });
      setStep('complete');
    } catch (error) {
      toast.error('Failed to save preferences');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDone = () => {
    onComplete();
    onOpenChange(false);
    // Reset for next time
    setStep('welcome');
  };

  const shortenUrl = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.pathname.length > 25 
        ? parsed.pathname.substring(0, 25) + '...' 
        : parsed.pathname;
    } catch {
      return url.length > 30 ? url.substring(0, 30) + '...' : url;
    }
  };

  const getCatalogSizeLabel = (size: string) => {
    switch (size) {
      case 'small': return 'Small';
      case 'medium': return 'Medium';
      case 'large': return 'Large';
      default: return size;
    }
  };

  const getProductChurnLabel = (churn: string) => {
    switch (churn) {
      case 'low': return 'Rarely';
      case 'medium': return 'Sometimes';
      case 'high': return 'Frequently';
      default: return churn;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0 gap-0 overflow-hidden">
        <div className="p-8 min-h-[400px] flex flex-col">
          {/* Step: Welcome */}
          {step === 'welcome' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Link2 className="w-6 h-6 text-primary" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">Let's set up your links</h2>
                <p className="text-muted-foreground">
                  I'll ask a few quick questions so I know where to send
                  traffic from your campaigns.
                </p>
                <p className="text-sm text-muted-foreground">
                  This takes about 30 seconds.
                </p>
              </div>
              <Button onClick={handleNext} className="mt-4">
                Let's go
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          )}

          {/* Step: Default Destination - Choice */}
          {step === 'default-destination' && (
            <div className="flex-1 flex flex-col">
              <div className="space-y-4 flex-1">
                <div className="space-y-2">
                  <p className="text-foreground">
                    For a general send, would we send to your site homepage? Or somewhere else?
                  </p>
                </div>

                <div className="space-y-3 mt-6">
                  <button
                    onClick={handleHomepageChoice}
                    className="w-full p-4 rounded-lg border border-border hover:border-primary/50 text-left transition-colors"
                  >
                    <span className="font-medium">Homepage is fine!</span>
                  </button>
                  <button
                    onClick={handleSomewhereElseChoice}
                    className="w-full p-4 rounded-lg border border-border hover:border-primary/50 text-left transition-colors"
                  >
                    <span className="font-medium">Somewhere else</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-start mt-6">
                <Button variant="ghost" onClick={handleBack}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </div>
            </div>
          )}

          {/* Step: Default Destination - URL Entry */}
          {step === 'default-destination-url' && (
            <div className="flex-1 flex flex-col">
              <div className="space-y-4 flex-1">
                <div className="space-y-2">
                  <p className="text-foreground">
                    Where should I send people?
                  </p>
                </div>

                <div className="space-y-4 mt-6">
                  <div className="space-y-2">
                    <Label>Name (optional)</Label>
                    <Input
                      placeholder="e.g., Primary Landing Page"
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

              <div className="flex justify-between mt-6">
                <Button variant="ghost" onClick={handleBack}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleNext}>
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step: Routing Choice */}
          {step === 'routing-choice' && (
            <div className="flex-1 flex flex-col">
              <div className="space-y-4 flex-1">
                <div className="space-y-2">
                  <p className="text-foreground">
                    Are there specific products or categories that should
                    lead somewhere specific?
                  </p>
                  <p className="text-sm text-muted-foreground">
                    For instance, maybe you have some products with dedicated
                    landing pages you'd like to always send to, instead of
                    the site product page.
                  </p>
                </div>

                <div className="space-y-3 mt-6">
                  <button
                    onClick={() => setWantsRules(false)}
                    className={cn(
                      "w-full p-4 rounded-lg border text-left transition-colors",
                      wantsRules === false
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <span className="font-medium">No, normal destinations are fine</span>
                  </button>
                  <button
                    onClick={() => setWantsRules(true)}
                    className={cn(
                      "w-full p-4 rounded-lg border text-left transition-colors",
                      wantsRules === true
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/50"
                    )}
                  >
                    <span className="font-medium">Yes, I have some preferences</span>
                  </button>
                </div>
              </div>

              <div className="flex justify-between mt-6">
                <Button variant="ghost" onClick={handleBack}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleNext} disabled={wantsRules === null}>
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step: Add Rules */}
          {step === 'add-rules' && (
            <div className="flex-1 flex flex-col">
              <div className="space-y-4 flex-1">
                <p className="text-foreground">
                  {rules.length === 0 
                    ? "Got it. Let's add your first rule."
                    : "Add another rule, or continue when you're done."}
                </p>

                {/* Summary of added rules */}
                {rules.length > 0 && (
                  <div className="space-y-2 pb-4 border-b">
                    {rules.map(rule => (
                      <div key={rule.id} className="flex items-center justify-between text-sm">
                        <span className="flex items-center gap-2">
                          <Check className="w-4 h-4 text-green-500" />
                          <span>{rule.name}</span>
                          <span className="text-muted-foreground">→ {shortenUrl(rule.destination_url)}</span>
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteRule(rule.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>What should I call this rule?</Label>
                    <Input
                      placeholder="e.g., Protein campaigns"
                      value={currentRuleName}
                      onChange={(e) => setCurrentRuleName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>What keywords should trigger it?</Label>
                    <Input
                      placeholder="protein, whey, mass gainer"
                      value={currentRuleKeywords}
                      onChange={(e) => setCurrentRuleKeywords(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated. If any appear in the campaign, I'll use this destination.
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Where should these campaigns link?</Label>
                    <Input
                      placeholder="https://store.com/pages/protein-lp"
                      value={currentRuleUrl}
                      onChange={(e) => setCurrentRuleUrl(e.target.value)}
                    />
                  </div>
                </div>

                {(currentRuleName || currentRuleKeywords || currentRuleUrl) && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleAddAnotherRule}
                    className="mt-2"
                  >
                    + Add another rule
                  </Button>
                )}
              </div>

              <div className="flex justify-between mt-6">
                <Button variant="ghost" onClick={handleBack}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleNext}>
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          )}

          {/* Step: Catalog */}
          {step === 'catalog' && (
            <div className="flex-1 flex flex-col">
              <div className="space-y-4 flex-1">
                <p className="text-foreground">
                  Last thing — tell me a bit about your product catalog.
                </p>

                <div className="space-y-4 mt-4">
                  <div className="space-y-2">
                    <Label>How many products does this brand have?</Label>
                    <Select value={catalogSize} onValueChange={(v) => setCatalogSize(v as 'small' | 'medium' | 'large')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="small">Small — under 50 products</SelectItem>
                        <SelectItem value="medium">Medium — 50 to 500 products</SelectItem>
                        <SelectItem value="large">Large — 500+ products</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>How often do you add new products?</Label>
                    <Select value={productChurn} onValueChange={(v) => setProductChurn(v as 'low' | 'medium' | 'high')}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Rarely — mostly the same products</SelectItem>
                        <SelectItem value="medium">Sometimes — occasional new releases</SelectItem>
                        <SelectItem value="high">Frequently — always adding new items</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex justify-between mt-6">
                <Button variant="ghost" onClick={handleBack}>
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
                <Button onClick={handleNext} disabled={isSaving}>
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    'Finish'
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* Step: Complete */}
          {step === 'complete' && (
            <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center">
                <Check className="w-6 h-6 text-green-500" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-semibold">You're all set</h2>
                <p className="text-muted-foreground">
                  I'll use these preferences when processing campaigns
                  for this brand.
                </p>
              </div>

              <div className="text-left w-full p-4 rounded-lg bg-muted/50 space-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Default destination: </span>
                  <span className="font-medium">{defaultDestinationName || 'Custom URL'}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Rules: </span>
                  <span className="font-medium">{rules.length} configured</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Catalog: </span>
                  <span className="font-medium">{getCatalogSizeLabel(catalogSize)} • Updates {getProductChurnLabel(productChurn).toLowerCase()}</span>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                You can edit these anytime in the Link Intelligence
                section of this brand's settings.
              </p>

              <Button onClick={handleDone} className="mt-4">
                Done
              </Button>
            </div>
          )}
        </div>

        {/* Progress dots */}
        {step !== 'complete' && (
          <div className="flex justify-center gap-2 pb-6">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "w-2 h-2 rounded-full transition-colors",
                  stepIndex[step] === i ? "bg-primary" : "bg-muted-foreground/30"
                )}
              />
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
