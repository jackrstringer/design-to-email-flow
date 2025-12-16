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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import type { Brand, BrandFooter, BrandTypography, HtmlFormattingRule } from '@/types/brand-assets';

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

      // Update brand with new data
      const updates: any = {};
      
      if (data?.colors) {
        updates.primary_color = data.colors.primary || brand.primaryColor;
        updates.secondary_color = data.colors.secondary || brand.secondaryColor;
        updates.accent_color = data.colors.accent || null;
        updates.background_color = data.colors.background || null;
        updates.text_primary_color = data.colors.textPrimary || null;
        updates.link_color = data.colors.link || null;
      }

      // Merge typography with fonts, spacing, and components
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
      setFooterIsPrimary(footers.length === 0); // First footer is primary by default
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
      // If setting as primary, unset other primaries first
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
      // Unset all primaries
      await supabase
        .from('brand_footers')
        .update({ is_primary: false })
        .eq('brand_id', brand.id);

      // Set this one as primary
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

  const maskedApiKey = brand.klaviyoApiKey 
    ? `pk_****${brand.klaviyoApiKey.slice(-4)}` 
    : null;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-bold text-lg"
              style={{ backgroundColor: brand.primaryColor }}
            >
              {brand.name.charAt(0)}
            </div>
            <div>
              <h1 className="text-xl font-semibold">{brand.name}</h1>
              <p className="text-sm text-muted-foreground">{brand.domain}</p>
            </div>
          </div>
        </div>
        <Button 
          variant="outline" 
          size="sm" 
          onClick={handleReanalyze}
          disabled={isReanalyzing || !brand.websiteUrl}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isReanalyzing ? 'animate-spin' : ''}`} />
          {isReanalyzing ? 'Analyzing...' : 'Re-analyze Brand'}
        </Button>
      </div>

      {/* Brand Colors & Typography Section - Always visible at top */}
      <div className="rounded-xl border border-border/60 p-5 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="font-medium">Brand Identity</h2>
          {!editingColors && (
            <Button variant="outline" size="sm" onClick={() => setEditingColors(true)}>
              <Pencil className="h-3 w-3 mr-2" />
              Edit Colors
            </Button>
          )}
        </div>

        {/* Colors */}
        {editingColors ? (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="text-xs">Primary</Label>
                <div className="flex items-center gap-2">
                  <input 
                    type="color" 
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <Input 
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                    className="flex-1 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Secondary</Label>
                <div className="flex items-center gap-2">
                  <input 
                    type="color" 
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <Input 
                    value={secondaryColor}
                    onChange={(e) => setSecondaryColor(e.target.value)}
                    className="flex-1 text-xs font-mono"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Accent</Label>
                <div className="flex items-center gap-2">
                  <input 
                    type="color" 
                    value={accentColor || '#000000'}
                    onChange={(e) => setAccentColor(e.target.value)}
                    className="w-10 h-10 rounded cursor-pointer"
                  />
                  <Input 
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                    placeholder="Optional"
                    className="flex-1 text-xs font-mono"
                  />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setEditingColors(false)}>Cancel</Button>
              <Button size="sm" onClick={handleSaveColors} disabled={isSaving}>Save</Button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg shadow-sm border" style={{ backgroundColor: brand.primaryColor }} />
              <div>
                <span className="text-xs text-muted-foreground">Primary</span>
                <p className="text-xs font-mono">{brand.primaryColor}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg shadow-sm border" style={{ backgroundColor: brand.secondaryColor }} />
              <div>
                <span className="text-xs text-muted-foreground">Secondary</span>
                <p className="text-xs font-mono">{brand.secondaryColor}</p>
              </div>
            </div>
            {brand.accentColor && (
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg shadow-sm border" style={{ backgroundColor: brand.accentColor }} />
                <div>
                  <span className="text-xs text-muted-foreground">Accent</span>
                  <p className="text-xs font-mono">{brand.accentColor}</p>
                </div>
              </div>
            )}
            {brand.backgroundColor && (
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg shadow-sm border" style={{ backgroundColor: brand.backgroundColor }} />
                <div>
                  <span className="text-xs text-muted-foreground">Background</span>
                  <p className="text-xs font-mono">{brand.backgroundColor}</p>
                </div>
              </div>
            )}
            {brand.textPrimaryColor && (
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg shadow-sm border" style={{ backgroundColor: brand.textPrimaryColor }} />
                <div>
                  <span className="text-xs text-muted-foreground">Text</span>
                  <p className="text-xs font-mono">{brand.textPrimaryColor}</p>
                </div>
              </div>
            )}
            {brand.linkColor && (
              <div className="flex items-center gap-2">
                <div className="w-10 h-10 rounded-lg shadow-sm border" style={{ backgroundColor: brand.linkColor }} />
                <div>
                  <span className="text-xs text-muted-foreground">Link</span>
                  <p className="text-xs font-mono">{brand.linkColor}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Typography */}
        {brand.typography && Object.keys(brand.typography).length > 0 && (
          <div className="pt-4 border-t border-border/40">
            <div className="flex items-center gap-2 mb-3">
              <Type className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Typography</span>
            </div>
            <div className="space-y-3">
              {/* Font Families */}
              {brand.typography.fontFamilies && Object.keys(brand.typography.fontFamilies).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(brand.typography.fontFamilies).map(([key, value]) => (
                    <div key={key} className="px-3 py-1.5 rounded-lg bg-muted/50 text-sm">
                      <span className="text-muted-foreground text-xs">{key}:</span>{' '}
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Font Sizes */}
              {brand.typography.fontSizes && Object.keys(brand.typography.fontSizes).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {Object.entries(brand.typography.fontSizes).map(([key, value]) => (
                    <div key={key} className="px-2 py-1 rounded bg-muted/30 text-xs font-mono">
                      {key}: {value}
                    </div>
                  ))}
                </div>
              )}
              {/* Detected Fonts */}
              {brand.typography.fonts && brand.typography.fonts.length > 0 && (
                <div className="pt-2">
                  <span className="text-xs text-muted-foreground mb-2 block">Detected Fonts:</span>
                  <div className="flex flex-wrap gap-2">
                    {brand.typography.fonts.map((font: any, i: number) => (
                      <div key={i} className="px-2 py-1 rounded bg-muted/30 text-xs">
                        <span className="font-medium">{font.family}</span>
                        {font.role && <span className="text-muted-foreground ml-1">({font.role})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {/* Spacing */}
              {brand.typography.spacing && (
                <div className="pt-2">
                  <span className="text-xs text-muted-foreground mb-2 block">Spacing:</span>
                  <div className="flex flex-wrap gap-2">
                    {brand.typography.spacing.baseUnit && (
                      <div className="px-2 py-1 rounded bg-muted/30 text-xs font-mono">
                        Base Unit: {brand.typography.spacing.baseUnit}px
                      </div>
                    )}
                    {brand.typography.spacing.borderRadius && (
                      <div className="px-2 py-1 rounded bg-muted/30 text-xs font-mono">
                        Border Radius: {brand.typography.spacing.borderRadius}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <Accordion type="multiple" defaultValue={['footers', 'api']} className="space-y-4">
        {/* Links Section */}
        <AccordionItem value="links" className="border border-border/60 rounded-xl px-5">
          <AccordionTrigger className="py-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Scraped Links</span>
              <span className="text-xs text-muted-foreground ml-2">({brand.allLinks.length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            {brand.allLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No links scraped yet</p>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {brand.allLinks.map((link, i) => (
                  <div 
                    key={i}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors group"
                  >
                    <span className="text-sm truncate flex-1">{link}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 opacity-0 group-hover:opacity-100"
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
          </AccordionContent>
        </AccordionItem>

        {/* Footers Section */}
        <AccordionItem value="footers" className="border border-border/60 rounded-xl px-5">
          <AccordionTrigger className="py-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <Code className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Footers</span>
              <span className="text-xs text-muted-foreground ml-2">({footers.length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-4">
              {footers.map((footer) => (
                <div 
                  key={footer.id}
                  className="rounded-lg border border-border/60 bg-card overflow-hidden"
                >
                  {/* Footer header */}
                  <div className="flex items-center justify-between p-3 border-b border-border/40">
                    <div className="flex items-center gap-3">
                      {footer.isPrimary && (
                        <Star className="h-4 w-4 text-primary fill-primary" />
                      )}
                      <span className="font-medium text-sm">{footer.name}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {!footer.isPrimary && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs"
                          onClick={() => handleSetPrimary(footer)}
                        >
                          Set Primary
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => openFooterEditor(footer)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteFooter(footer)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {/* Inline HTML preview - proper email table structure */}
                  <div className="flex justify-center bg-muted/30 p-4">
                    <div className="w-[400px] overflow-hidden rounded border border-border/40">
                      <iframe
                        srcDoc={`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { margin: 0; padding: 0; background: #f6f6f6; font-family: Arial, sans-serif; }
    .email-wrapper { max-width: 600px; margin: 0 auto; background: #ffffff; }
  </style>
</head>
<body>
  <center>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #f6f6f6;">
      <tr>
        <td align="center">
          <table role="presentation" class="email-wrapper" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; background-color: #ffffff;">
            ${footer.html}
          </table>
        </td>
      </tr>
    </table>
  </center>
</body>
</html>`}
                        className="w-full"
                        style={{ height: '300px' }}
                        sandbox="allow-same-origin"
                        title={`${footer.name} preview`}
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => openFooterEditor()}
              >
                <Plus className="h-3 w-3 mr-2" />
                Add Footer
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* API Key Section */}
        <AccordionItem value="api" className="border border-border/60 rounded-xl px-5">
          <AccordionTrigger className="py-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <Key className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Klaviyo API Key</span>
              {maskedApiKey ? (
                <span className="text-xs text-green-600 ml-2">Connected</span>
              ) : (
                <span className="text-xs text-amber-600 ml-2">Not configured</span>
              )}
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-3">
              {maskedApiKey ? (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <code className="text-sm">{maskedApiKey}</code>
                  <Button variant="outline" size="sm" onClick={() => setEditApiKey(true)}>
                    Update Key
                  </Button>
                </div>
              ) : (
                <Button onClick={() => setEditApiKey(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add API Key
                </Button>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>


        {/* HTML Formatting Rules Section */}
        <AccordionItem value="rules" className="border border-border/60 rounded-xl px-5">
          <AccordionTrigger className="py-4 hover:no-underline">
            <div className="flex items-center gap-2">
              <Code className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">HTML Formatting Rules</span>
              <span className="text-xs text-muted-foreground ml-2">({(brand.htmlFormattingRules || []).length})</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="pb-4">
            <div className="space-y-3">
              {(brand.htmlFormattingRules || []).map((rule) => (
                <div 
                  key={rule.id}
                  className="p-3 rounded-lg border border-border/60 bg-card"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="font-medium text-sm">{rule.name}</span>
                      {rule.description && (
                        <p className="text-xs text-muted-foreground">{rule.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => openRulesEditor(rule)}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDeleteRule(rule.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  <pre className="text-xs bg-muted p-2 rounded overflow-x-auto">
                    {rule.code.slice(0, 200)}{rule.code.length > 200 ? '...' : ''}
                  </pre>
                </div>
              ))}
              
              <Button 
                variant="outline" 
                size="sm" 
                className="w-full"
                onClick={() => openRulesEditor()}
              >
                <Plus className="h-3 w-3 mr-2" />
                Add Formatting Rule
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

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
                <div className="border rounded-lg overflow-hidden bg-white">
                  <iframe
                    srcDoc={footerHtml}
                    className="w-full h-48"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFooterEditorOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveFooter} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Footer'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Formatting Rules Editor Dialog */}
      <Dialog open={rulesEditorOpen} onOpenChange={setRulesEditorOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Formatting Rule' : 'Add Formatting Rule'}</DialogTitle>
            <DialogDescription>
              Define HTML/CSS patterns to use when generating email HTML
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="e.g., Button Style, Heading Format"
                value={ruleName}
                onChange={(e) => setRuleName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                placeholder="Brief description of when to use this rule"
                value={ruleDescription}
                onChange={(e) => setRuleDescription(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Code</Label>
              <Textarea
                placeholder="/* CSS or HTML template */"
                value={ruleCode}
                onChange={(e) => setRuleCode(e.target.value)}
                className="font-mono text-xs min-h-[150px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRulesEditorOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveRule} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Rule'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}