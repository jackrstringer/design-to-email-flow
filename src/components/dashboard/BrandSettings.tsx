import { useState, useEffect } from 'react';
import { ArrowLeft, Plus, Copy, Check, Key, Pencil, Trash2, Star, ExternalLink, Code, RefreshCw, Type } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Brand, BrandFooter, BrandTypography, HtmlFormattingRule } from '@/types/brand-assets';
import { ChevronRight } from 'lucide-react';

interface BrandSettingsProps {
  brand: Brand;
  onBack: () => void;
  onBrandChange: () => void;
}

export function BrandSettings({ brand, onBack, onBrandChange }: BrandSettingsProps) {
  const [footers, setFooters] = useState<BrandFooter[]>([]);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [editApiKey, setEditApiKey] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState(brand.klaviyoApiKey || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  
  // Footer editor state
  const [footerEditorOpen, setFooterEditorOpen] = useState(false);
  const [editingFooter, setEditingFooter] = useState<BrandFooter | null>(null);
  const [footerName, setFooterName] = useState('');
  const [footerHtml, setFooterHtml] = useState('');
  const [footerIsPrimary, setFooterIsPrimary] = useState(false);

  // Color editor state
  const [editingColors, setEditingColors] = useState(false);
  const [primaryColor, setPrimaryColor] = useState(brand.primaryColor);
  const [secondaryColor, setSecondaryColor] = useState(brand.secondaryColor);
  const [accentColor, setAccentColor] = useState(brand.accentColor || '');

  // Formatting rules state
  const [rulesEditorOpen, setRulesEditorOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<HtmlFormattingRule | null>(null);
  const [ruleName, setRuleName] = useState('');
  const [ruleDescription, setRuleDescription] = useState('');
  const [ruleCode, setRuleCode] = useState('');

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    footers: true,
    api: true,
  });

  useEffect(() => {
    fetchFooters();
  }, [brand.id]);

  const fetchFooters = async () => {
    const { data, error } = await supabase
      .from('brand_footers')
      .select('*')
      .eq('brand_id', brand.id)
      .order('is_primary', { ascending: false });

    if (!error && data) {
      setFooters(data.map(row => ({
        id: row.id,
        brandId: row.brand_id,
        name: row.name,
        html: row.html,
        isPrimary: row.is_primary || false,
        logoUrl: row.logo_url || undefined,
        logoPublicId: row.logo_public_id || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })));
    }
  };

  const copyLink = async (link: string) => {
    await navigator.clipboard.writeText(link);
    setCopiedLink(link);
    setTimeout(() => setCopiedLink(null), 2000);
  };

  const handleSaveApiKey = async () => {
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('brands')
        .update({ klaviyo_api_key: apiKeyValue || null })
        .eq('id', brand.id);

      if (error) throw error;
      toast.success('API key updated');
      setEditApiKey(false);
      onBrandChange();
    } catch (error) {
      toast.error('Failed to update API key');
    } finally {
      setIsSaving(false);
    }
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

  const handleReanalyze = async () => {
    if (!brand.websiteUrl) {
      toast.error('No website URL to analyze');
      return;
    }

    setIsReanalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-brand', {
        body: { websiteUrl: brand.websiteUrl }
      });

      if (error) throw error;

      const updates: any = {};
      
      if (data?.colors) {
        updates.primary_color = data.colors.primary || brand.primaryColor;
        updates.secondary_color = data.colors.secondary || brand.secondaryColor;
        updates.accent_color = data.colors.accent || null;
        updates.background_color = data.colors.background || null;
        updates.text_primary_color = data.colors.textPrimary || null;
        updates.link_color = data.colors.link || null;
      }

      if (data?.typography || data?.fonts || data?.spacing || data?.components) {
        updates.typography = {
          ...(data.typography || {}),
          fonts: data.fonts || [],
          spacing: data.spacing || null,
          components: data.components || null,
        };
      }

      if (data?.socialLinks) {
        updates.social_links = data.socialLinks;
      }

      if (data?.allLinks) {
        updates.all_links = data.allLinks;
      }

      const { error: updateError } = await supabase
        .from('brands')
        .update(updates)
        .eq('id', brand.id);

      if (updateError) throw updateError;

      toast.success('Brand info refreshed');
      onBrandChange();
    } catch (error) {
      console.error('Error re-analyzing brand:', error);
      toast.error('Failed to re-analyze brand');
    } finally {
      setIsReanalyzing(false);
    }
  };

  const openFooterEditor = (footer?: BrandFooter) => {
    if (footer) {
      setEditingFooter(footer);
      setFooterName(footer.name);
      setFooterHtml(footer.html);
      setFooterIsPrimary(footer.isPrimary);
    } else {
      setEditingFooter(null);
      setFooterName('');
      setFooterHtml('');
      setFooterIsPrimary(footers.length === 0);
    }
    setFooterEditorOpen(true);
  };

  const handleSaveFooter = async () => {
    if (!footerName.trim() || !footerHtml.trim()) {
      toast.error('Name and HTML are required');
      return;
    }

    setIsSaving(true);
    try {
      if (footerIsPrimary) {
        await supabase
          .from('brand_footers')
          .update({ is_primary: false })
          .eq('brand_id', brand.id);
      }

      if (editingFooter) {
        const { error } = await supabase
          .from('brand_footers')
          .update({
            name: footerName,
            html: footerHtml,
            is_primary: footerIsPrimary,
          })
          .eq('id', editingFooter.id);

        if (error) throw error;
        toast.success('Footer updated');
      } else {
        const { error } = await supabase
          .from('brand_footers')
          .insert({
            brand_id: brand.id,
            name: footerName,
            html: footerHtml,
            is_primary: footerIsPrimary,
          });

        if (error) throw error;
        toast.success('Footer created');
      }

      setFooterEditorOpen(false);
      fetchFooters();
    } catch (error) {
      toast.error('Failed to save footer');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFooter = async (footer: BrandFooter) => {
    if (!confirm(`Delete "${footer.name}"?`)) return;

    const { error } = await supabase
      .from('brand_footers')
      .delete()
      .eq('id', footer.id);

    if (error) {
      toast.error('Failed to delete footer');
      return;
    }

    toast.success('Footer deleted');
    fetchFooters();
  };

  const handleSetPrimary = async (footer: BrandFooter) => {
    try {
      await supabase
        .from('brand_footers')
        .update({ is_primary: false })
        .eq('brand_id', brand.id);

      await supabase
        .from('brand_footers')
        .update({ is_primary: true })
        .eq('id', footer.id);

      toast.success('Primary footer updated');
      fetchFooters();
    } catch (error) {
      toast.error('Failed to update primary footer');
    }
  };

  const openRulesEditor = (rule?: HtmlFormattingRule) => {
    if (rule) {
      setEditingRule(rule);
      setRuleName(rule.name);
      setRuleDescription(rule.description || '');
      setRuleCode(rule.code);
    } else {
      setEditingRule(null);
      setRuleName('');
      setRuleDescription('');
      setRuleCode('');
    }
    setRulesEditorOpen(true);
  };

  const handleSaveRule = async () => {
    if (!ruleName.trim() || !ruleCode.trim()) {
      toast.error('Name and code are required');
      return;
    }

    setIsSaving(true);
    try {
      const currentRules = brand.htmlFormattingRules || [];
      const newRule: HtmlFormattingRule = {
        id: editingRule?.id || crypto.randomUUID(),
        name: ruleName,
        description: ruleDescription || undefined,
        code: ruleCode,
      };

      let updatedRules: HtmlFormattingRule[];
      if (editingRule) {
        updatedRules = currentRules.map(r => r.id === editingRule.id ? newRule : r);
      } else {
        updatedRules = [...currentRules, newRule];
      }

      const { error } = await supabase
        .from('brands')
        .update({ html_formatting_rules: updatedRules as any })
        .eq('id', brand.id);

      if (error) throw error;
      toast.success('Formatting rule saved');
      setRulesEditorOpen(false);
      onBrandChange();
    } catch (error) {
      toast.error('Failed to save rule');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRule = async (ruleId: string) => {
    if (!confirm('Delete this formatting rule?')) return;

    const updatedRules = (brand.htmlFormattingRules || []).filter(r => r.id !== ruleId);
    
    const { error } = await supabase
      .from('brands')
      .update({ html_formatting_rules: updatedRules as any })
      .eq('id', brand.id);

    if (error) {
      toast.error('Failed to delete rule');
      return;
    }

    toast.success('Rule deleted');
    onBrandChange();
  };

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const maskedApiKey = brand.klaviyoApiKey 
    ? `pk_****${brand.klaviyoApiKey.slice(-4)}` 
    : null;

  // Collect all colors for display
  const allColors = [
    { label: 'Primary', value: brand.primaryColor },
    { label: 'Secondary', value: brand.secondaryColor },
    brand.accentColor && { label: 'Accent', value: brand.accentColor },
    brand.backgroundColor && { label: 'Background', value: brand.backgroundColor },
    brand.textPrimaryColor && { label: 'Text', value: brand.textPrimaryColor },
    brand.linkColor && { label: 'Link', value: brand.linkColor },
  ].filter(Boolean) as { label: string; value: string }[];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between py-6 border-b border-border/30">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div 
            className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-semibold"
            style={{ backgroundColor: brand.primaryColor }}
          >
            {brand.name.charAt(0)}
          </div>
          <div>
            <h1 className="text-lg font-semibold">{brand.name}</h1>
            <p className="text-sm text-muted-foreground">{brand.domain}</p>
          </div>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={handleReanalyze}
          disabled={isReanalyzing || !brand.websiteUrl}
          className="text-muted-foreground hover:text-foreground"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isReanalyzing ? 'animate-spin' : ''}`} />
          {isReanalyzing ? 'Analyzing...' : 'Re-analyze'}
        </Button>
      </div>

      {/* Colors Section */}
      <div className="py-6 border-b border-border/30">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Colors</h2>
          {!editingColors && (
            <Button variant="ghost" size="sm" onClick={() => setEditingColors(true)} className="h-7 text-xs">
              <Pencil className="h-3 w-3 mr-1" />
              Edit
            </Button>
          )}
        </div>

        {editingColors ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
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
          <div className="flex flex-wrap gap-4">
            {allColors.map((color) => (
              <div key={color.label} className="flex items-center gap-2">
                <div 
                  className="w-6 h-6 rounded-md shadow-sm ring-1 ring-black/5" 
                  style={{ backgroundColor: color.value }} 
                />
                <span className="text-sm">{color.label}</span>
                <span className="text-xs text-muted-foreground font-mono">{color.value}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Typography Section */}
      {brand.typography && Object.keys(brand.typography).length > 0 && (
        <div className="py-6 border-b border-border/30">
          <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Typography</h2>
          <div className="space-y-3">
            {brand.typography.fontFamilies && Object.keys(brand.typography.fontFamilies).length > 0 && (
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {Object.entries(brand.typography.fontFamilies).map(([key, value]) => (
                  <div key={key} className="text-sm">
                    <span className="text-muted-foreground">{key}:</span>{' '}
                    <span className="font-medium">{value}</span>
                  </div>
                ))}
              </div>
            )}
            {brand.typography.fonts && brand.typography.fonts.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {brand.typography.fonts.map((font: any, i: number) => (
                  <span key={i} className="text-sm">
                    {font.family}
                    {font.role && <span className="text-muted-foreground"> ({font.role})</span>}
                    {i < brand.typography!.fonts!.length - 1 && <span className="text-muted-foreground">,</span>}
                  </span>
                ))}
              </div>
            )}
            {brand.typography.spacing && (
              <div className="flex gap-4 text-sm text-muted-foreground">
                {brand.typography.spacing.baseUnit && (
                  <span>Base: {brand.typography.spacing.baseUnit}px</span>
                )}
                {brand.typography.spacing.borderRadius && (
                  <span>Radius: {brand.typography.spacing.borderRadius}</span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scraped Links */}
      <Collapsible open={openSections.links} onOpenChange={() => toggleSection('links')}>
        <CollapsibleTrigger className="w-full py-4 border-b border-border/30 flex items-center justify-between hover:bg-muted/30 -mx-2 px-2 rounded">
          <div className="flex items-center gap-2">
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.links ? 'rotate-90' : ''}`} />
            <span className="text-sm font-medium">Scraped Links</span>
            <span className="text-xs text-muted-foreground">({brand.allLinks.length})</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="py-4">
          {brand.allLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No links scraped yet</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {brand.allLinks.map((link, i) => (
                <div 
                  key={i}
                  className="flex items-center justify-between gap-2 py-1.5 group"
                >
                  <span className="text-sm truncate flex-1 text-muted-foreground">{link}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100"
                    onClick={() => copyLink(link)}
                  >
                    {copiedLink === link ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Footers */}
      <Collapsible open={openSections.footers} onOpenChange={() => toggleSection('footers')}>
        <CollapsibleTrigger className="w-full py-4 border-b border-border/30 flex items-center justify-between hover:bg-muted/30 -mx-2 px-2 rounded">
          <div className="flex items-center gap-2">
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.footers ? 'rotate-90' : ''}`} />
            <span className="text-sm font-medium">Footers</span>
            <span className="text-xs text-muted-foreground">({footers.length})</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="py-4">
          <div className="grid grid-cols-3 gap-4">
            {footers.map((footer) => (
              <div key={footer.id} className="group">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {footer.isPrimary && <Star className="h-3 w-3 text-primary fill-primary" />}
                    <span className="text-xs font-medium truncate">{footer.name}</span>
                  </div>
                  <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!footer.isPrimary && (
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSetPrimary(footer)} title="Set Primary">
                        <Star className="h-3 w-3" />
                      </Button>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openFooterEditor(footer)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteFooter(footer)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {/* Footer preview - scaled down to fit 3 per row */}
                <div className="bg-muted/20 rounded-lg overflow-hidden h-[200px]">
                  <iframe
                    srcDoc={`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; padding: 0; background: #f6f6f6; font-family: Arial, sans-serif; }
  </style>
</head>
<body>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width: 600px; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    ${footer.html}
  </table>
</body>
</html>`}
                    className="border-0"
                    style={{ 
                      width: '600px',
                      height: '600px',
                      transform: 'scale(0.33)',
                      transformOrigin: 'top left',
                    }}
                    sandbox="allow-same-origin"
                    title={`${footer.name} preview`}
                  />
                </div>
              </div>
            ))}
            
            {/* Add footer button as a card */}
            <button 
              onClick={() => openFooterEditor()}
              className="h-[200px] rounded-lg border border-dashed border-border/50 flex items-center justify-center text-muted-foreground hover:bg-muted/20 hover:border-border transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              <span className="text-sm">Add Footer</span>
            </button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* API Key */}
      <Collapsible open={openSections.api} onOpenChange={() => toggleSection('api')}>
        <CollapsibleTrigger className="w-full py-4 border-b border-border/30 flex items-center justify-between hover:bg-muted/30 -mx-2 px-2 rounded">
          <div className="flex items-center gap-2">
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.api ? 'rotate-90' : ''}`} />
            <span className="text-sm font-medium">Klaviyo API Key</span>
            {maskedApiKey ? (
              <span className="text-xs text-green-600">Connected</span>
            ) : (
              <span className="text-xs text-amber-600">Not configured</span>
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="py-4">
          {maskedApiKey ? (
            <div className="flex items-center justify-between">
              <code className="text-sm text-muted-foreground">{maskedApiKey}</code>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditApiKey(true)}>
                Update
              </Button>
            </div>
          ) : (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setEditApiKey(true)}>
              <Plus className="h-3 w-3 mr-2" />
              Add API Key
            </Button>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* HTML Formatting Rules */}
      <Collapsible open={openSections.rules} onOpenChange={() => toggleSection('rules')}>
        <CollapsibleTrigger className="w-full py-4 border-b border-border/30 flex items-center justify-between hover:bg-muted/30 -mx-2 px-2 rounded">
          <div className="flex items-center gap-2">
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.rules ? 'rotate-90' : ''}`} />
            <span className="text-sm font-medium">HTML Formatting Rules</span>
            <span className="text-xs text-muted-foreground">({(brand.htmlFormattingRules || []).length})</span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="py-4">
          <div className="space-y-3">
            {(brand.htmlFormattingRules || []).map((rule) => (
              <div key={rule.id} className="group">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="text-sm font-medium">{rule.name}</span>
                    {rule.description && (
                      <p className="text-xs text-muted-foreground">{rule.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openRulesEditor(rule)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteRule(rule.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <pre className="text-xs text-muted-foreground mt-1 font-mono">
                  {rule.code.slice(0, 100)}{rule.code.length > 100 ? '...' : ''}
                </pre>
              </div>
            ))}
            
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => openRulesEditor()}>
              <Plus className="h-3 w-3 mr-2" />
              Add Rule
            </Button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* API Key Dialog */}
      <Dialog open={editApiKey} onOpenChange={setEditApiKey}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Klaviyo API Key</DialogTitle>
            <DialogDescription>
              Enter the private API key for {brand.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Private API Key</Label>
              <Input
                type="password"
                placeholder="pk_xxxxxxxxxxxxxxxxxxxxxxxx"
                value={apiKeyValue}
                onChange={(e) => setApiKeyValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Find this in Klaviyo → Settings → API Keys
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditApiKey(false)}>Cancel</Button>
            <Button onClick={handleSaveApiKey} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Footer Editor Dialog */}
      <Dialog open={footerEditorOpen} onOpenChange={setFooterEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingFooter ? 'Edit Footer' : 'Add Footer'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="e.g., Standard Footer, Holiday Footer"
                value={footerName}
                onChange={(e) => setFooterName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>HTML</Label>
              <Textarea
                placeholder="<table>...</table>"
                value={footerHtml}
                onChange={(e) => setFooterHtml(e.target.value)}
                className="font-mono text-xs min-h-[200px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={footerIsPrimary}
                onCheckedChange={setFooterIsPrimary}
              />
              <Label>Set as primary footer</Label>
            </div>
            {footerHtml && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="rounded-lg overflow-hidden bg-muted/30">
                  <iframe
                    srcDoc={footerHtml}
                    className="w-full h-48 border-0"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFooterEditorOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveFooter} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Formatting Rules Dialog */}
      <Dialog open={rulesEditorOpen} onOpenChange={setRulesEditorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Rule' : 'Add Formatting Rule'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="e.g., Button Style, Link Format"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                placeholder="Brief description of this rule"
                value={ruleDescription}
                onChange={(e) => setRuleDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Code / Template</Label>
              <Textarea
                placeholder="HTML or CSS template..."
                value={ruleCode}
                onChange={(e) => setRuleCode(e.target.value)}
                className="font-mono text-xs min-h-[150px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRulesEditorOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRule} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
