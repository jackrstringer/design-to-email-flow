import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Copy, Check, Key, Pencil, Trash2, Star, ExternalLink, Code, RefreshCw, Type, Upload, Image, X } from 'lucide-react';
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
import { FooterBuilderModal } from '@/components/FooterBuilderModal';

interface BrandSettingsProps {
  brand: Brand;
  onBack?: () => void;
  onBrandChange: () => void;
}

export function BrandSettings({ brand, onBack, onBrandChange }: BrandSettingsProps) {
  const navigate = useNavigate();
  const [footers, setFooters] = useState<BrandFooter[]>([]);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [editApiKey, setEditApiKey] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState(brand.klaviyoApiKey || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isReanalyzing, setIsReanalyzing] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState<'dark' | 'light' | null>(null);
  
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

  // Footer method selection state
  const [addFooterMethodOpen, setAddFooterMethodOpen] = useState(false);
  const [footerBuilderOpen, setFooterBuilderOpen] = useState(false);

  // Copy examples state
  const [isSyncingCopy, setIsSyncingCopy] = useState(false);
  const [copyExamples, setCopyExamples] = useState<{
    subjectLines: string[];
    previewTexts: string[];
    lastScraped: string | null;
  }>({ subjectLines: [], previewTexts: [], lastScraped: null });

  // ClickUp integration state
  const [clickupApiKey, setClickupApiKey] = useState((brand as any).clickup_api_key || '');
  const [clickupWorkspaceId, setClickupWorkspaceId] = useState((brand as any).clickup_workspace_id || '');
  const [clickupListId, setClickupListId] = useState((brand as any).clickup_list_id || '');
  const [showClickupApiKey, setShowClickupApiKey] = useState(false);
  const [isLoadingClickupData, setIsLoadingClickupData] = useState(false);
  const [isSavingClickup, setIsSavingClickup] = useState(false);
  const [clickupWorkspaces, setClickupWorkspaces] = useState<{id: string; name: string}[]>([]);
  const [clickupSpaces, setClickupSpaces] = useState<{id: string; name: string}[]>([]);
  const [clickupFolders, setClickupFolders] = useState<{id: string; name: string}[]>([]);
  const [clickupLists, setClickupLists] = useState<{id: string; name: string; folderless?: boolean}[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    footers: true,
    api: true,
    clickup: false,
    copyExamples: false,
  });

  useEffect(() => {
    fetchFooters();
    // Parse copy_examples from brand if available
    if ((brand as any).copy_examples) {
      const examples = (brand as any).copy_examples;
      setCopyExamples({
        subjectLines: examples.subjectLines || [],
        previewTexts: examples.previewTexts || [],
        lastScraped: examples.lastScraped || null,
      });
    }
    
    // Handle hash navigation - auto-expand and scroll to section
    const hash = window.location.hash.replace('#', '');
    if (hash && ['footers', 'api', 'copyExamples'].includes(hash)) {
      setOpenSections(prev => ({ ...prev, [hash]: true }));
      // Scroll to section after a short delay to allow render
      setTimeout(() => {
        const element = document.getElementById(`section-${hash}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    }
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

  const handleSyncKlaviyoCopy = async () => {
    if (!brand.klaviyoApiKey) {
      toast.error('Please add a Klaviyo API key first');
      return;
    }

    setIsSyncingCopy(true);
    try {
      const { data, error } = await supabase.functions.invoke('scrape-klaviyo-copy', {
        body: {
          brandId: brand.id,
          klaviyoApiKey: brand.klaviyoApiKey,
        }
      });

      if (error) throw error;

      if (data.subjectLinesCount === 0 && data.previewTextsCount === 0) {
        toast.warning(
          `Scanned ${data.campaignsScanned} campaigns but found 0 subject lines. ` +
          `This may mean campaigns lack accessible copy or your API key needs 'Read Campaigns' scope.`,
          { duration: 8000 }
        );
      } else {
        toast.success(`Synced ${data.subjectLinesCount} subject lines and ${data.previewTextsCount} preview texts`);
      }
      onBrandChange();
    } catch (error) {
      console.error('Error syncing Klaviyo copy:', error);
      toast.error('Failed to sync from Klaviyo');
    } finally {
      setIsSyncingCopy(false);
    }
  };

  const handleCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      // Skip header if present
      const startIndex = lines[0]?.toLowerCase().includes('type') ? 1 : 0;
      
      const newSubjectLines: string[] = [...copyExamples.subjectLines];
      const newPreviewTexts: string[] = [...copyExamples.previewTexts];
      
      for (let i = startIndex; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length < 2) continue;
        
        const type = parts[0].trim().toLowerCase();
        const text = parts.slice(1).join(',').trim().replace(/^["']|["']$/g, '');
        
        if (type === 'subject' || type === 'sl') {
          if (text && !newSubjectLines.includes(text)) {
            newSubjectLines.push(text);
          }
        } else if (type === 'preview' || type === 'pt') {
          if (text && !newPreviewTexts.includes(text)) {
            newPreviewTexts.push(text);
          }
        }
      }

      const updatedExamples = {
        subjectLines: newSubjectLines,
        previewTexts: newPreviewTexts,
        lastScraped: copyExamples.lastScraped,
      };

      const { error } = await supabase
        .from('brands')
        .update({ copy_examples: updatedExamples })
        .eq('id', brand.id);

      if (error) throw error;

      setCopyExamples(updatedExamples);
      toast.success(`Added ${newSubjectLines.length - copyExamples.subjectLines.length} SLs, ${newPreviewTexts.length - copyExamples.previewTexts.length} PTs`);
      onBrandChange();
    } catch (error) {
      console.error('CSV upload error:', error);
      toast.error('Failed to parse CSV');
    }

    e.target.value = '';
  };

  const handleClearCopyExamples = async () => {
    if (!confirm('Clear all copy examples?')) return;

    const emptyExamples = { subjectLines: [], previewTexts: [], lastScraped: null };
    
    const { error } = await supabase
      .from('brands')
      .update({ copy_examples: emptyExamples })
      .eq('id', brand.id);

    if (error) {
      toast.error('Failed to clear examples');
      return;
    }

    setCopyExamples(emptyExamples);
    toast.success('Copy examples cleared');
    onBrandChange();
  };

  // ClickUp integration handlers
  const fetchClickupWorkspaces = async (apiKey: string) => {
    if (!apiKey) return;
    setIsLoadingClickupData(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'workspaces', clickupApiKey: apiKey }
      });
      if (error) throw error;
      setClickupWorkspaces(data.workspaces || []);
    } catch (err) {
      console.error('Failed to fetch ClickUp workspaces:', err);
      toast.error('Failed to connect to ClickUp. Check your API key.');
      setClickupWorkspaces([]);
    } finally {
      setIsLoadingClickupData(false);
    }
  };

  const fetchClickupSpaces = async (workspaceId: string) => {
    if (!workspaceId || !clickupApiKey) return;
    setIsLoadingClickupData(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'spaces', clickupApiKey, workspaceId }
      });
      if (error) throw error;
      setClickupSpaces(data.spaces || []);
      setClickupFolders([]);
      setClickupLists([]);
      setSelectedSpaceId('');
      setSelectedFolderId('');
    } catch (err) {
      console.error('Failed to fetch ClickUp spaces:', err);
    } finally {
      setIsLoadingClickupData(false);
    }
  };

  const fetchClickupFoldersAndLists = async (spaceId: string) => {
    if (!spaceId || !clickupApiKey) return;
    setIsLoadingClickupData(true);
    setSelectedSpaceId(spaceId);
    setSelectedFolderId('');
    try {
      // Fetch folders
      const { data: foldersData } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'folders', clickupApiKey, spaceId }
      });
      setClickupFolders(foldersData?.folders || []);
      
      // Also fetch folderless lists
      const { data: listsData } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'lists', clickupApiKey, spaceId }
      });
      setClickupLists(listsData?.lists || []);
    } catch (err) {
      console.error('Failed to fetch ClickUp folders/lists:', err);
    } finally {
      setIsLoadingClickupData(false);
    }
  };

  const fetchClickupListsFromFolder = async (folderId: string) => {
    if (!folderId || !clickupApiKey) return;
    setIsLoadingClickupData(true);
    setSelectedFolderId(folderId);
    try {
      const { data, error } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'lists', clickupApiKey, folderId, spaceId: selectedSpaceId }
      });
      if (error) throw error;
      setClickupLists(data.lists || []);
    } catch (err) {
      console.error('Failed to fetch ClickUp lists:', err);
    } finally {
      setIsLoadingClickupData(false);
    }
  };

  const handleSaveClickupSettings = async () => {
    setIsSavingClickup(true);
    try {
      const { error } = await supabase
        .from('brands')
        .update({
          clickup_api_key: clickupApiKey || null,
          clickup_workspace_id: clickupWorkspaceId || null,
          clickup_list_id: clickupListId || null,
        })
        .eq('id', brand.id);

      if (error) throw error;
      toast.success('ClickUp settings saved');
      onBrandChange();
    } catch (error) {
      toast.error('Failed to save ClickUp settings');
    } finally {
      setIsSavingClickup(false);
    }
  };

  const handleLogoUpload = useCallback(async (file: File, type: 'dark' | 'light') => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please upload an image file');
      return;
    }

    setUploadingLogo(type);
    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const base64 = await base64Promise;

      // Upload to Cloudinary
      const { data, error } = await supabase.functions.invoke('upload-to-cloudinary', {
        body: {
          imageData: base64,
          folder: `brands/${brand.domain}/logos`,
          publicId: `${type}-logo`,
        },
      });

      if (error) throw error;

      // Update brand in database
      const updateFields = type === 'dark'
        ? { dark_logo_url: data.url, dark_logo_public_id: data.publicId }
        : { light_logo_url: data.url, light_logo_public_id: data.publicId };

      const { error: updateError } = await supabase
        .from('brands')
        .update(updateFields)
        .eq('id', brand.id);

      if (updateError) throw updateError;

      toast.success(`${type === 'dark' ? 'Dark' : 'Light'} logo uploaded`);
      onBrandChange();
    } catch (error) {
      console.error('Logo upload error:', error);
      toast.error('Failed to upload logo');
    } finally {
      setUploadingLogo(null);
    }
  }, [brand.id, brand.domain, onBrandChange]);

  const handleLogoRemove = useCallback(async (type: 'dark' | 'light') => {
    try {
      const updateFields = type === 'dark'
        ? { dark_logo_url: null, dark_logo_public_id: null }
        : { light_logo_url: null, light_logo_public_id: null };

      const { error } = await supabase
        .from('brands')
        .update(updateFields)
        .eq('id', brand.id);

      if (error) throw error;

      toast.success('Logo removed');
      onBrandChange();
    } catch (error) {
      toast.error('Failed to remove logo');
    }
  }, [brand.id, onBrandChange]);

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
    <div>
      {/* Header */}
      <div className="flex items-center justify-between pb-6 border-b border-border/30">
        <div className="flex items-center gap-3">
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

      {/* Logos Section */}
      <div className="py-6 border-b border-border/30">
        <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-4">Logos</h2>
        
        {/* Missing logo warning */}
        {(!brand.lightLogoUrl || !brand.darkLogoUrl) && (
          <div className="flex items-start gap-2 p-3 mb-4 bg-amber-50 border border-amber-200 rounded-lg">
            <Image className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-800">
              <p className="font-medium">Missing logo variant</p>
              <p className="text-amber-700 text-xs mt-0.5">
                {!brand.lightLogoUrl && !brand.darkLogoUrl 
                  ? 'Upload both dark and light logo versions for best results'
                  : !brand.lightLogoUrl 
                    ? 'Upload a light logo for dark backgrounds (like footers)'
                    : 'Upload a dark logo for light backgrounds'}
              </p>
            </div>
          </div>
        )}
        
        <div className="grid grid-cols-2 gap-6">
          {/* Dark Logo */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Dark Logo (for light backgrounds)</Label>
            {brand.darkLogoUrl ? (
              <div className="relative group rounded-lg border border-border/50 bg-white p-4">
                <img 
                  src={brand.darkLogoUrl} 
                  alt="Dark logo" 
                  className="max-h-20 max-w-full object-contain mx-auto"
                />
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => copyLink(brand.darkLogoUrl!)}
                  >
                    {copiedLink === brand.darkLogoUrl ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleLogoRemove('dark')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 cursor-pointer hover:bg-amber-100 transition-colors">
                {uploadingLogo === 'dark' ? (
                  <span className="text-xs text-amber-700">Uploading...</span>
                ) : (
                  <>
                    <Upload className="h-5 w-5 text-amber-600 mb-1" />
                    <span className="text-xs text-amber-700 font-medium">Upload dark logo</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file, 'dark');
                    e.target.value = '';
                  }}
                  disabled={uploadingLogo !== null}
                />
              </label>
            )}
          </div>

          {/* Light Logo */}
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Light Logo (for dark backgrounds)</Label>
            {brand.lightLogoUrl ? (
              <div className="relative group rounded-lg border border-border/50 bg-zinc-900 p-4">
                <img 
                  src={brand.lightLogoUrl} 
                  alt="Light logo" 
                  className="max-h-20 max-w-full object-contain mx-auto"
                />
                <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => copyLink(brand.lightLogoUrl!)}
                  >
                    {copiedLink === brand.lightLogoUrl ? (
                      <Check className="h-3 w-3 text-green-600" />
                    ) : (
                      <Copy className="h-3 w-3" />
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleLogoRemove('light')}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center h-24 rounded-lg border-2 border-dashed border-amber-300 bg-zinc-900 cursor-pointer hover:bg-zinc-800 transition-colors">
                {uploadingLogo === 'light' ? (
                  <span className="text-xs text-amber-400">Uploading...</span>
                ) : (
                  <>
                    <Upload className="h-5 w-5 text-amber-400 mb-1" />
                    <span className="text-xs text-amber-400 font-medium">Upload light logo</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file, 'light');
                    e.target.value = '';
                  }}
                  disabled={uploadingLogo !== null}
                />
              </label>
            )}
          </div>
        </div>
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
              onClick={() => setAddFooterMethodOpen(true)}
              className="h-[200px] rounded-lg border border-dashed border-border/50 flex items-center justify-center text-muted-foreground hover:bg-muted/20 hover:border-border transition-colors"
            >
              <Plus className="h-4 w-4 mr-2" />
              <span className="text-sm">Add Footer</span>
            </button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* ClickUp Integration */}
      <Collapsible open={openSections.clickup} onOpenChange={() => toggleSection('clickup')}>
        <CollapsibleTrigger className="w-full py-4 border-b border-border/30 flex items-center justify-between hover:bg-muted/30 -mx-2 px-2 rounded">
          <div className="flex items-center gap-2">
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.clickup ? 'rotate-90' : ''}`} />
            <span className="text-sm font-medium">ClickUp Integration</span>
            {clickupListId ? (
              <span className="text-xs text-green-600">Connected</span>
            ) : (
              <span className="text-xs text-muted-foreground">Optional</span>
            )}
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="py-4">
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Connect ClickUp to automatically pull subject lines and preview text from campaign tasks.
            </p>
            
            {/* API Token */}
            <div className="space-y-1.5">
              <Label className="text-xs">API Token</Label>
              <div className="flex gap-2">
                <Input
                  type={showClickupApiKey ? 'text' : 'password'}
                  value={clickupApiKey}
                  onChange={(e) => setClickupApiKey(e.target.value)}
                  placeholder="pk_..."
                  className="flex-1 h-8 text-xs font-mono"
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setShowClickupApiKey(!showClickupApiKey)}
                >
                  {showClickupApiKey ? 'Hide' : 'Show'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => fetchClickupWorkspaces(clickupApiKey)}
                  disabled={!clickupApiKey || isLoadingClickupData}
                >
                  {isLoadingClickupData ? 'Loading...' : 'Connect'}
                </Button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Get your token at <a href="https://app.clickup.com/settings/apps" target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">app.clickup.com → Settings → Apps</a>
              </p>
            </div>

            {/* Workspace selector */}
            {clickupWorkspaces.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Workspace</Label>
                <select
                  value={clickupWorkspaceId}
                  onChange={(e) => {
                    setClickupWorkspaceId(e.target.value);
                    fetchClickupSpaces(e.target.value);
                  }}
                  className="w-full h-8 text-xs border rounded px-2"
                >
                  <option value="">Select workspace...</option>
                  {clickupWorkspaces.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Space selector */}
            {clickupSpaces.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Space</Label>
                <select
                  value={selectedSpaceId}
                  onChange={(e) => fetchClickupFoldersAndLists(e.target.value)}
                  className="w-full h-8 text-xs border rounded px-2"
                >
                  <option value="">Select space...</option>
                  {clickupSpaces.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Folder selector (optional) */}
            {clickupFolders.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">Folder (optional)</Label>
                <select
                  value={selectedFolderId}
                  onChange={(e) => fetchClickupListsFromFolder(e.target.value)}
                  className="w-full h-8 text-xs border rounded px-2"
                >
                  <option value="">No folder (folderless lists)</option>
                  {clickupFolders.map(f => (
                    <option key={f.id} value={f.id}>{f.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* List selector */}
            {clickupLists.length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs">List (where campaign tasks live)</Label>
                <select
                  value={clickupListId}
                  onChange={(e) => setClickupListId(e.target.value)}
                  className="w-full h-8 text-xs border rounded px-2"
                >
                  <option value="">Select list...</option>
                  {clickupLists.map(l => (
                    <option key={l.id} value={l.id}>{l.name}{l.folderless ? ' (folderless)' : ''}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Save button */}
            {(clickupApiKey || clickupListId) && (
              <Button
                size="sm"
                onClick={handleSaveClickupSettings}
                disabled={isSavingClickup}
                className="text-xs"
              >
                {isSavingClickup ? 'Saving...' : 'Save ClickUp Settings'}
              </Button>
            )}
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


      {/* Copy Examples */}
      <Collapsible open={openSections.copyExamples} onOpenChange={() => toggleSection('copyExamples')}>
        <CollapsibleTrigger className="w-full py-4 border-b border-border/30 flex items-center justify-between hover:bg-muted/30 -mx-2 px-2 rounded">
          <div className="flex items-center gap-2">
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.copyExamples ? 'rotate-90' : ''}`} />
            <span className="text-sm font-medium">Copy Examples (SL/PT)</span>
            <span className="text-xs text-muted-foreground">
              ({copyExamples.subjectLines.length} SL, {copyExamples.previewTexts.length} PT)
            </span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="py-4">
          <div className="space-y-4">
            {/* Sync status */}
            {copyExamples.lastScraped && (
              <p className="text-xs text-muted-foreground">
                Last synced: {new Date(copyExamples.lastScraped).toLocaleDateString()} at {new Date(copyExamples.lastScraped).toLocaleTimeString()}
              </p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleSyncKlaviyoCopy}
                disabled={isSyncingCopy || !brand.klaviyoApiKey}
                className="text-xs"
              >
                <RefreshCw className={`h-3 w-3 mr-2 ${isSyncingCopy ? 'animate-spin' : ''}`} />
                {isSyncingCopy ? 'Syncing...' : 'Sync from Klaviyo'}
              </Button>

              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCsvUpload}
                  className="hidden"
                />
                <Button variant="outline" size="sm" className="text-xs" asChild>
                  <span>
                    <Upload className="h-3 w-3 mr-2" />
                    Upload CSV
                  </span>
                </Button>
              </label>

              {(copyExamples.subjectLines.length > 0 || copyExamples.previewTexts.length > 0) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearCopyExamples}
                  className="text-xs text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3 mr-2" />
                  Clear All
                </Button>
              )}
            </div>

            {/* CSV format hint */}
            <p className="text-xs text-muted-foreground">
              CSV format: <code className="bg-muted px-1 rounded">type,text</code> where type is "subject" or "preview"
            </p>

            {/* Preview of examples */}
            {copyExamples.subjectLines.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Subject Lines ({copyExamples.subjectLines.length})</p>
                <div className="max-h-24 overflow-y-auto space-y-0.5">
                  {copyExamples.subjectLines.slice(0, 5).map((sl, i) => (
                    <p key={i} className="text-xs text-muted-foreground truncate">• {sl}</p>
                  ))}
                  {copyExamples.subjectLines.length > 5 && (
                    <p className="text-xs text-muted-foreground">...and {copyExamples.subjectLines.length - 5} more</p>
                  )}
                </div>
              </div>
            )}

            {copyExamples.previewTexts.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Preview Texts ({copyExamples.previewTexts.length})</p>
                <div className="max-h-24 overflow-y-auto space-y-0.5">
                  {copyExamples.previewTexts.slice(0, 5).map((pt, i) => (
                    <p key={i} className="text-xs text-muted-foreground truncate">• {pt}</p>
                  ))}
                  {copyExamples.previewTexts.length > 5 && (
                    <p className="text-xs text-muted-foreground">...and {copyExamples.previewTexts.length - 5} more</p>
                  )}
                </div>
              </div>
            )}

            {copyExamples.subjectLines.length === 0 && copyExamples.previewTexts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No examples yet. Sync from Klaviyo or upload a CSV to train the AI on your brand voice.
              </p>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

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

      {/* Add Footer Method Selection Dialog */}
      <Dialog open={addFooterMethodOpen} onOpenChange={setAddFooterMethodOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Footer</DialogTitle>
            <DialogDescription>
              Choose how you want to create your footer
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <button
              onClick={() => {
                setAddFooterMethodOpen(false);
                setFooterBuilderOpen(true);
              }}
              className="flex flex-col items-center gap-3 p-6 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Image className="h-5 w-5 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-medium text-sm">Create from Image</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload a reference image and we'll generate the HTML
                </p>
              </div>
            </button>
            <button
              onClick={() => {
                setAddFooterMethodOpen(false);
                openFooterEditor();
              }}
              className="flex flex-col items-center gap-3 p-6 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Code className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-center">
                <h3 className="font-medium text-sm">Upload HTML</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Paste your own footer HTML code directly
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer Builder Modal */}
      <FooterBuilderModal
        open={footerBuilderOpen}
        onOpenChange={setFooterBuilderOpen}
        brand={brand}
        onFooterSaved={() => {
          fetchFooters();
          onBrandChange();
        }}
        onOpenStudio={(referenceImageUrl, footerHtml, figmaDesignData) => {
          navigate(`/footer-editor/${brand.id}`, {
            state: {
              referenceImageUrl,
              footerHtml,
              footerName: 'New Footer',
              figmaDesignData,
            }
          });
        }}
      />

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
