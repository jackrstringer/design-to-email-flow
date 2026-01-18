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
import type { Brand, BrandFooter, BrandTypography } from '@/types/brand-assets';
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
  const [isDeleting, setIsDeleting] = useState(false);
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

  // ClickUp integration state - uses master API key from profile
  const [masterClickupApiKey, setMasterClickupApiKey] = useState<string | null>(null);
  const [masterClickupWorkspaceId, setMasterClickupWorkspaceId] = useState<string | null>(null);
  const [clickupListId, setClickupListId] = useState(brand.clickupListId || '');
  const [isLoadingClickupData, setIsLoadingClickupData] = useState(false);
  const [isSavingClickup, setIsSavingClickup] = useState(false);
  const [clickupSpaces, setClickupSpaces] = useState<{id: string; name: string}[]>([]);
  const [clickupFolders, setClickupFolders] = useState<{id: string; name: string}[]>([]);
  const [clickupLists, setClickupLists] = useState<{id: string; name: string; folderless?: boolean}[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [clickupConnectedInfo, setClickupConnectedInfo] = useState<{ workspaceName: string; listName: string } | null>(null);
  const [isReconfiguring, setIsReconfiguring] = useState(false);
  
  // Sent Copy state - aggregated from campaign_queue
  const [sentCopy, setSentCopy] = useState<{
    subjectLines: { text: string; count: number }[];
    previewTexts: { text: string; count: number }[];
  }>({ subjectLines: [], previewTexts: [] });

  // Collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    footers: true,
    api: true,
    clickup: false,
    copyExamples: false,
    sentCopy: false,
  });

  useEffect(() => {
    fetchFooters();
    fetchMasterClickUpConnection();
    fetchSentCopy();
    
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
    if (hash && ['footers', 'api', 'copyExamples', 'sentCopy'].includes(hash)) {
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
  
  // Fetch master ClickUp connection from user profile
  const fetchMasterClickUpConnection = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: profile } = await supabase
        .from('profiles')
        .select('clickup_api_key, clickup_workspace_id')
        .eq('id', user.id)
        .single();
      
      if (profile) {
        setMasterClickupApiKey(profile.clickup_api_key);
        setMasterClickupWorkspaceId(profile.clickup_workspace_id);
        
        // If we have a master connection and brand has list configured, fetch connected info
        if (profile.clickup_api_key && brand.clickupListId) {
          fetchClickupConnectedInfo(profile.clickup_api_key, profile.clickup_workspace_id);
        }
        
        // Auto-fetch spaces if master is connected
        if (profile.clickup_api_key && profile.clickup_workspace_id) {
          fetchClickupSpaces(profile.clickup_workspace_id, profile.clickup_api_key);
        }
      }
    } catch (err) {
      console.error('Failed to fetch master ClickUp connection:', err);
    }
  };
  
  // Fetch sent copy from campaign_queue
  const fetchSentCopy = async () => {
    try {
      const { data, error } = await supabase
        .from('campaign_queue')
        .select('selected_subject_line, selected_preview_text')
        .eq('brand_id', brand.id)
        .eq('status', 'sent_to_klaviyo')
        .not('selected_subject_line', 'is', null);
      
      if (error) throw error;
      
      // Aggregate unique values with counts
      const slCounts = new Map<string, number>();
      const ptCounts = new Map<string, number>();
      
      data?.forEach(item => {
        if (item.selected_subject_line) {
          slCounts.set(item.selected_subject_line, 
            (slCounts.get(item.selected_subject_line) || 0) + 1);
        }
        if (item.selected_preview_text) {
          ptCounts.set(item.selected_preview_text,
            (ptCounts.get(item.selected_preview_text) || 0) + 1);
        }
      });
      
      setSentCopy({
        subjectLines: Array.from(slCounts.entries())
          .map(([text, count]) => ({ text, count }))
          .sort((a, b) => b.count - a.count),
        previewTexts: Array.from(ptCounts.entries())
          .map(([text, count]) => ({ text, count }))
          .sort((a, b) => b.count - a.count)
      });
    } catch (err) {
      console.error('Failed to fetch sent copy:', err);
    }
  };

  // Sync ClickUp list ID when brand prop changes
  useEffect(() => {
    setClickupListId(brand.clickupListId || '');
    
    // Refetch connected info with master key
    if (masterClickupApiKey && brand.clickupListId) {
      fetchClickupConnectedInfo(masterClickupApiKey, masterClickupWorkspaceId);
    } else {
      setClickupConnectedInfo(null);
    }
  }, [brand.clickupListId, masterClickupApiKey, masterClickupWorkspaceId]);

  const fetchClickupConnectedInfo = async (apiKey: string, workspaceId: string | null) => {
    if (!apiKey || !brand.clickupListId) return;
    
    try {
      // Fetch workspaces to get workspace name
      const { data: wsData } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'workspaces', clickupApiKey: apiKey }
      });
      
      const workspaceName = wsData?.workspaces?.find(
        (w: { id: string; name: string }) => w.id === workspaceId
      )?.name || (workspaceId ? `Workspace ${workspaceId}` : 'Unknown');
      
      // For list name, we'd need to traverse - for now show list ID
      setClickupConnectedInfo({
        workspaceName,
        listName: `List ID: ${brand.clickupListId}`,
      });
    } catch (err) {
      console.error('Failed to fetch ClickUp connected info:', err);
      // Even if fetch fails, show basic info
      setClickupConnectedInfo({
        workspaceName: workspaceId ? `Workspace ${workspaceId}` : 'Unknown',
        listName: `List ID: ${brand.clickupListId}`,
      });
    }
  };

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

  const handleDeleteBrand = async () => {
    if (!confirm(`Are you sure you want to delete "${brand.name}"? This action cannot be undone.`)) {
      return;
    }

    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('brands')
        .delete()
        .eq('id', brand.id);

      if (error) throw error;

      toast.success('Brand deleted');
      navigate('/brands');
    } catch (error) {
      console.error('Error deleting brand:', error);
      toast.error('Failed to delete brand');
    } finally {
      setIsDeleting(false);
    }
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

  // ClickUp integration handlers - use master API key from profile
  const fetchClickupSpaces = async (workspaceId: string, apiKey?: string) => {
    const key = apiKey || masterClickupApiKey;
    if (!workspaceId || !key) return;
    setIsLoadingClickupData(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'spaces', clickupApiKey: key, workspaceId }
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
    if (!spaceId || !masterClickupApiKey) return;
    setIsLoadingClickupData(true);
    setSelectedSpaceId(spaceId);
    setSelectedFolderId('');
    try {
      // Fetch folders
      const { data: foldersData } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'folders', clickupApiKey: masterClickupApiKey, spaceId }
      });
      setClickupFolders(foldersData?.folders || []);
      
      // Also fetch folderless lists
      const { data: listsData } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'lists', clickupApiKey: masterClickupApiKey, spaceId }
      });
      setClickupLists(listsData?.lists || []);
    } catch (err) {
      console.error('Failed to fetch ClickUp folders/lists:', err);
    } finally {
      setIsLoadingClickupData(false);
    }
  };

  const fetchClickupListsFromFolder = async (folderId: string) => {
    if (!folderId || !masterClickupApiKey) return;
    setIsLoadingClickupData(true);
    setSelectedFolderId(folderId);
    try {
      const { data, error } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'lists', clickupApiKey: masterClickupApiKey, folderId, spaceId: selectedSpaceId }
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
      // Only save the list_id to the brand - API key is stored at user level
      const { error } = await supabase
        .from('brands')
        .update({
          clickup_list_id: clickupListId || null,
        })
        .eq('id', brand.id);

      if (error) throw error;
      
      // Update connected info display
      const listName = clickupLists.find(l => l.id === clickupListId)?.name || `List ID: ${clickupListId}`;
      setClickupConnectedInfo({ 
        workspaceName: masterClickupWorkspaceId ? `Workspace ${masterClickupWorkspaceId}` : 'Unknown',
        listName 
      });
      setIsReconfiguring(false);
      
      toast.success('ClickUp location saved');
      onBrandChange();
    } catch (error) {
      toast.error('Failed to save ClickUp settings');
    } finally {
      setIsSavingClickup(false);
    }
  };

  const handleDisconnectClickup = async () => {
    if (!confirm('Disconnect ClickUp location? Campaign tasks will no longer pull copy from ClickUp.')) return;
    
    setIsSavingClickup(true);
    try {
      const { error } = await supabase
        .from('brands')
        .update({
          clickup_list_id: null,
        })
        .eq('id', brand.id);

      if (error) throw error;
      
      // Reset local state
      setClickupListId('');
      setClickupConnectedInfo(null);
      setClickupSpaces([]);
      setClickupFolders([]);
      setClickupLists([]);
      setSelectedSpaceId('');
      setSelectedFolderId('');
      setIsReconfiguring(false);
      
      toast.success('ClickUp location disconnected');
      onBrandChange();
    } catch (error) {
      toast.error('Failed to disconnect ClickUp');
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
        <div className="flex items-center gap-2">
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
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleDeleteBrand}
            disabled={isDeleting}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className={`h-4 w-4 mr-2`} />
            {isDeleting ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
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
            {/* Check if master ClickUp connection exists */}
            {!masterClickupApiKey ? (
              /* No master connection - prompt to set up in Integrations */
              <div className="space-y-3">
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md dark:bg-amber-950 dark:border-amber-800">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">ClickUp not connected</p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Set up your ClickUp connection in Integrations to enable automatic copy fetching.
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs"
                  onClick={() => navigate('/settings')}
                >
                  <ExternalLink className="h-3 w-3 mr-2" />
                  Go to Integrations
                </Button>
              </div>
            ) : clickupListId && clickupConnectedInfo && !isReconfiguring ? (
              /* Connected state view */
              <div className="space-y-3">
                <div className="p-3 bg-green-50 border border-green-200 rounded-md dark:bg-green-950 dark:border-green-800">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-green-800 dark:text-green-200">Connected to ClickUp</p>
                      <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                        {clickupConnectedInfo.workspaceName}<br/>
                        {clickupConnectedInfo.listName}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => {
                          setIsReconfiguring(true);
                          // Pre-fetch spaces using master connection
                          if (masterClickupApiKey && masterClickupWorkspaceId) {
                            fetchClickupSpaces(masterClickupWorkspaceId, masterClickupApiKey);
                          }
                        }}
                      >
                        Change
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs text-red-600 hover:text-red-700 dark:text-red-400"
                        onClick={handleDisconnectClickup}
                        disabled={isSavingClickup}
                      >
                        {isSavingClickup ? 'Disconnecting...' : 'Disconnect'}
                      </Button>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Campaign tasks with Figma links will automatically pull subject lines and preview text from ClickUp.
                </p>
              </div>
            ) : (
              /* Location selection view - using master API key */
              <>
                <p className="text-xs text-muted-foreground">
                  Select the ClickUp list where this brand's campaign tasks live.
                </p>

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

                {/* No spaces loaded yet - show loading or prompt */}
                {clickupSpaces.length === 0 && !isLoadingClickupData && (
                  <p className="text-xs text-muted-foreground">
                    Loading ClickUp workspaces...
                  </p>
                )}

                {/* Save button */}
                <div className="flex gap-2">
                  {clickupListId && (
                    <Button
                      size="sm"
                      onClick={handleSaveClickupSettings}
                      disabled={isSavingClickup || !clickupListId}
                      className="text-xs"
                    >
                      {isSavingClickup ? 'Saving...' : 'Save Location'}
                    </Button>
                  )}
                  {isReconfiguring && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setIsReconfiguring(false)}
                    >
                      Cancel
                    </Button>
                  )}
                </div>
              </>
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

      {/* Sent Copy - Historically sent subject lines and preview texts */}
      <Collapsible open={openSections.sentCopy} onOpenChange={() => toggleSection('sentCopy')}>
        <CollapsibleTrigger className="w-full py-4 border-b border-border/30 flex items-center justify-between hover:bg-muted/30 -mx-2 px-2 rounded">
          <div className="flex items-center gap-2">
            <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${openSections.sentCopy ? 'rotate-90' : ''}`} />
            <span className="text-sm font-medium">Sent Copy</span>
            <span className="text-xs text-muted-foreground">
              ({sentCopy.subjectLines.length} SL, {sentCopy.previewTexts.length} PT)
            </span>
          </div>
        </CollapsibleTrigger>
        <CollapsibleContent className="py-4">
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              Subject lines and preview texts that were actually sent to Klaviyo.
            </p>

            {sentCopy.subjectLines.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Subject Lines ({sentCopy.subjectLines.length})</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {sentCopy.subjectLines.slice(0, 10).map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-muted-foreground truncate flex-1">• {item.text}</span>
                      <span className="text-muted-foreground/60 shrink-0">({item.count}x)</span>
                    </div>
                  ))}
                  {sentCopy.subjectLines.length > 10 && (
                    <p className="text-xs text-muted-foreground">...and {sentCopy.subjectLines.length - 10} more</p>
                  )}
                </div>
              </div>
            )}

            {sentCopy.previewTexts.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Preview Texts ({sentCopy.previewTexts.length})</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {sentCopy.previewTexts.slice(0, 10).map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-muted-foreground truncate flex-1">• {item.text}</span>
                      <span className="text-muted-foreground/60 shrink-0">({item.count}x)</span>
                    </div>
                  ))}
                  {sentCopy.previewTexts.length > 10 && (
                    <p className="text-xs text-muted-foreground">...and {sentCopy.previewTexts.length - 10} more</p>
                  )}
                </div>
              </div>
            )}

            {sentCopy.subjectLines.length === 0 && sentCopy.previewTexts.length === 0 && (
              <p className="text-xs text-muted-foreground">
                No campaigns have been sent to Klaviyo yet. Sent copy will appear here after you push campaigns.
              </p>
            )}
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

    </div>
  );
}
