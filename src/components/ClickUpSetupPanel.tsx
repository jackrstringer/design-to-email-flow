import { useState, useEffect, useCallback } from 'react';
import { Loader2, ExternalLink, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

interface ClickUpConfig {
  apiKey: string;
  workspaceId: string;
  listId: string;
}

interface ClickUpSetupPanelProps {
  brandId: string;
  initialConfig?: Partial<ClickUpConfig>;
  onComplete?: (config: ClickUpConfig) => void;
  onSkip?: () => void;
  isOptional?: boolean;
  compact?: boolean;
}

export function ClickUpSetupPanel({ 
  brandId, 
  initialConfig,
  onComplete, 
  onSkip, 
  isOptional = true,
  compact = false,
}: ClickUpSetupPanelProps) {
  const [clickupApiKey, setClickupApiKey] = useState(initialConfig?.apiKey || '');
  const [clickupWorkspaceId, setClickupWorkspaceId] = useState(initialConfig?.workspaceId || '');
  const [clickupListId, setClickupListId] = useState(initialConfig?.listId || '');
  const [showClickupApiKey, setShowClickupApiKey] = useState(false);
  const [isLoadingClickupData, setIsLoadingClickupData] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [clickupWorkspaces, setClickupWorkspaces] = useState<{id: string; name: string}[]>([]);
  const [clickupSpaces, setClickupSpaces] = useState<{id: string; name: string}[]>([]);
  const [clickupFolders, setClickupFolders] = useState<{id: string; name: string}[]>([]);
  const [clickupLists, setClickupLists] = useState<{id: string; name: string; folderless?: boolean}[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [isSaved, setIsSaved] = useState(false);

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
      const { data: foldersData } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'folders', clickupApiKey, spaceId }
      });
      setClickupFolders(foldersData?.folders || []);
      
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

  const handleSave = async () => {
    if (!clickupListId) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('brands')
        .update({
          clickup_api_key: clickupApiKey || null,
          clickup_workspace_id: clickupWorkspaceId || null,
          clickup_list_id: clickupListId || null,
        })
        .eq('id', brandId);

      if (error) throw error;
      
      setIsSaved(true);
      toast.success('ClickUp connected!');
      onComplete?.({ apiKey: clickupApiKey, workspaceId: clickupWorkspaceId, listId: clickupListId });
    } catch (error) {
      toast.error('Failed to save ClickUp settings');
    } finally {
      setIsSaving(false);
    }
  };

  if (isSaved) {
    return (
      <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
        <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
          <Check className="h-4 w-4" />
          <span className="text-sm font-medium">ClickUp connected!</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-4 ${compact ? 'p-3 bg-muted/50 rounded-lg' : ''}`}>
      {!compact && (
        <div className="space-y-1">
          <h3 className="text-sm font-medium">Connect ClickUp</h3>
          <p className="text-xs text-muted-foreground">
            Automatically pull subject lines and preview text from campaign tasks.
          </p>
        </div>
      )}
      
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
            className="h-8 text-xs shrink-0"
            onClick={() => setShowClickupApiKey(!showClickupApiKey)}
          >
            {showClickupApiKey ? 'Hide' : 'Show'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs shrink-0"
            onClick={() => fetchClickupWorkspaces(clickupApiKey)}
            disabled={!clickupApiKey || isLoadingClickupData}
          >
            {isLoadingClickupData && clickupWorkspaces.length === 0 ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              'Connect'
            )}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground">
          Get your token at{' '}
          <a 
            href="https://app.clickup.com/settings/apps" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-primary hover:underline inline-flex items-center gap-0.5"
          >
            Settings → Apps <ExternalLink className="h-2.5 w-2.5" />
          </a>
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
            className="w-full h-8 text-xs border rounded px-2 bg-background"
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
            className="w-full h-8 text-xs border rounded px-2 bg-background"
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
            className="w-full h-8 text-xs border rounded px-2 bg-background"
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
            className="w-full h-8 text-xs border rounded px-2 bg-background"
          >
            <option value="">Select list...</option>
            {clickupLists.map(l => (
              <option key={l.id} value={l.id}>{l.name}{l.folderless ? ' (folderless)' : ''}</option>
            ))}
          </select>
        </div>
      )}

      {/* Loading indicator */}
      {isLoadingClickupData && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span>Loading...</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={isSaving || !clickupListId}
          className="text-xs"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
              Saving...
            </>
          ) : (
            'Save ClickUp'
          )}
        </Button>
        {isOptional && onSkip && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className="text-xs text-muted-foreground"
          >
            Skip for now
          </Button>
        )}
      </div>
    </div>
  );
}
