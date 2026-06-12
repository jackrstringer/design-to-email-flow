import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ExternalLink, AlertCircle, Check, Link2, ChevronRight, Folder as FolderIcon, List as ListIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

interface BrandClickUpLocationSelectorProps {
  brandId: string;
  onComplete: () => void;
  onSkip: () => void;
}

interface ClickUpList {
  id: string;
  name: string;
  folderless?: boolean;
}

interface ClickUpFolder {
  id: string;
  name: string;
  lists: ClickUpList[] | null; // null = not fetched yet
  expanded: boolean;
  loading: boolean;
}

export function BrandClickUpLocationSelector({
  brandId,
  onComplete,
  onSkip
}: BrandClickUpLocationSelectorProps) {
  const { user } = useAuth();

  // Master connection from profile
  const [masterApiKey, setMasterApiKey] = useState<string | null>(null);
  const [masterWorkspaceId, setMasterWorkspaceId] = useState<string | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);

  // Hierarchy browsing
  const [spaces, setSpaces] = useState<{ id: string; name: string }[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [folders, setFolders] = useState<ClickUpFolder[]>([]);
  const [folderlessLists, setFolderlessLists] = useState<ClickUpList[]>([]);

  // Selection: one whole folder (optional) + any number of individual lists
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedListIds, setSelectedListIds] = useState<string[]>([]);

  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Fetch master ClickUp connection from profile
  useEffect(() => {
    async function fetchProfile() {
      if (!user) return;

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('clickup_api_key, clickup_workspace_id')
          .eq('id', user.id)
          .single();

        if (error) throw error;

        setMasterApiKey(data?.clickup_api_key || null);
        setMasterWorkspaceId(data?.clickup_workspace_id || null);

        if (data?.clickup_api_key && data?.clickup_workspace_id) {
          fetchSpaces(data.clickup_api_key, data.clickup_workspace_id);
        }
      } catch (error) {
        console.error('Failed to fetch profile:', error);
      } finally {
        setIsLoadingProfile(false);
      }
    }

    fetchProfile();
  }, [user]);

  const fetchSpaces = async (apiKey: string, workspaceId: string) => {
    setIsLoadingData(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'spaces', clickupApiKey: apiKey, workspaceId }
      });
      if (error) throw error;
      setSpaces(data.spaces || []);
    } catch (err) {
      console.error('Failed to fetch ClickUp spaces:', err);
      toast.error('Failed to load ClickUp spaces');
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleSpaceChange = async (spaceId: string) => {
    setSelectedSpaceId(spaceId);
    setFolders([]);
    setFolderlessLists([]);
    setSelectedFolderId(null);
    setSelectedListIds([]);

    if (!spaceId || !masterApiKey) return;

    setIsLoadingData(true);
    try {
      const [{ data: foldersData }, { data: listsData }] = await Promise.all([
        supabase.functions.invoke('get-clickup-hierarchy', {
          body: { type: 'folders', clickupApiKey: masterApiKey, spaceId }
        }),
        supabase.functions.invoke('get-clickup-hierarchy', {
          body: { type: 'lists', clickupApiKey: masterApiKey, spaceId }
        }),
      ]);
      setFolders(
        (foldersData?.folders || []).map((f: { id: string; name: string }) => ({
          ...f,
          lists: null,
          expanded: false,
          loading: false,
        }))
      );
      setFolderlessLists(listsData?.lists || []);
    } catch (err) {
      console.error('Failed to fetch folders/lists:', err);
      toast.error('Failed to load ClickUp folders');
    } finally {
      setIsLoadingData(false);
    }
  };

  // Fetch a folder's lists (for expansion or for pruning on folder-select)
  const fetchFolderLists = useCallback(async (folderId: string): Promise<ClickUpList[]> => {
    const { data, error } = await supabase.functions.invoke('get-clickup-hierarchy', {
      body: { type: 'lists', clickupApiKey: masterApiKey, folderId }
    });
    if (error) throw error;
    return data?.lists || [];
  }, [masterApiKey]);

  const ensureFolderLists = async (folderId: string): Promise<ClickUpList[]> => {
    const folder = folders.find(f => f.id === folderId);
    if (folder?.lists) return folder.lists;

    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, loading: true } : f));
    try {
      const lists = await fetchFolderLists(folderId);
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, lists, loading: false } : f));
      return lists;
    } catch (err) {
      console.error('Failed to fetch folder lists:', err);
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, loading: false } : f));
      return [];
    }
  };

  const toggleFolderExpanded = async (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;
    setFolders(prev => prev.map(f => f.id === folderId ? { ...f, expanded: !f.expanded } : f));
    if (!folder.expanded && !folder.lists) {
      await ensureFolderLists(folderId);
    }
  };

  const toggleFolderSelected = async (folderId: string, checked: boolean) => {
    if (checked) {
      // One whole-folder selection at a time (it maps to a single brand column)
      setSelectedFolderId(folderId);
      // Expand so the user sees what's included
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, expanded: true } : f));
      // Folder supersedes its child lists: prune them from explicit selection
      const lists = await ensureFolderLists(folderId);
      if (lists.length > 0) {
        const childIds = new Set(lists.map(l => l.id));
        setSelectedListIds(prev => prev.filter(id => !childIds.has(id)));
      }
    } else {
      setSelectedFolderId(prev => (prev === folderId ? null : prev));
    }
  };

  const toggleListSelected = (listId: string, checked: boolean) => {
    setSelectedListIds(prev =>
      checked ? (prev.includes(listId) ? prev : [...prev, listId]) : prev.filter(id => id !== listId)
    );
  };

  const selectedFolder = folders.find(f => f.id === selectedFolderId) || null;
  const hasSelection = !!selectedFolderId || selectedListIds.length > 0;

  const summaryText = (() => {
    const parts: string[] = [];
    if (selectedFolder) parts.push(`Folder ‘${selectedFolder.name}’ (all lists)`);
    if (selectedListIds.length > 0) {
      parts.push(`${selectedListIds.length} list${selectedListIds.length === 1 ? '' : 's'}`);
    }
    return parts.join(' + ');
  })();

  const handleSave = async () => {
    if (!hasSelection) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('brands')
        .update({
          clickup_list_ids: selectedListIds,
          clickup_folder_id: selectedFolderId,
          // Keep legacy single-list column populated for older read paths
          clickup_list_id: selectedListIds[0] || null,
        })
        .eq('id', brandId);

      if (error) throw error;

      setIsSaved(true);
      toast.success('ClickUp location saved!');
      setTimeout(() => onComplete(), 500);
    } catch (error) {
      console.error('Failed to save ClickUp location:', error);
      toast.error('Failed to save ClickUp location');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingProfile) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No master connection - prompt to set up
  if (!masterApiKey || !masterWorkspaceId) {
    return (
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 mx-auto rounded-full bg-muted flex items-center justify-center">
            <Link2 className="h-6 w-6 text-muted-foreground" />
          </div>
          <h3 className="font-medium">Connect ClickUp First</h3>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">
            To link this brand to ClickUp, you'll need to set up your ClickUp integration first.
          </p>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            ClickUp helps us automatically pull subject lines and preview text from your campaign tasks.
          </AlertDescription>
        </Alert>

        <div className="flex flex-col gap-2">
          <Button asChild variant="outline">
            <Link to="/settings">
              Set Up ClickUp Integration
              <ExternalLink className="h-4 w-4 ml-2" />
            </Link>
          </Button>
          <Button variant="ghost" onClick={onSkip} className="text-muted-foreground">
            Skip for now
          </Button>
        </div>
      </div>
    );
  }

  // Saved state
  if (isSaved) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-3">
        <div className="w-12 h-12 rounded-full bg-foreground dark:bg-foreground flex items-center justify-center">
          <Check className="h-6 w-6 text-background" />
        </div>
        <p className="font-medium text-foreground">ClickUp connected!</p>
      </div>
    );
  }

  const renderListRow = (list: ClickUpList, opts: { insideSelectedFolder?: boolean; indent?: boolean } = {}) => {
    const { insideSelectedFolder = false, indent = false } = opts;
    const checked = insideSelectedFolder || selectedListIds.includes(list.id);
    return (
      <label
        key={list.id}
        className={cn(
          'flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] leading-none',
          insideSelectedFolder
            ? 'cursor-default text-muted-foreground'
            : 'cursor-pointer hover:bg-muted/60',
          indent && 'ml-6'
        )}
      >
        <Checkbox
          checked={checked}
          disabled={insideSelectedFolder}
          onCheckedChange={(c) => toggleListSelected(list.id, c === true)}
          className="h-3.5 w-3.5"
        />
        <ListIcon className={cn('h-3.5 w-3.5 shrink-0', insideSelectedFolder ? 'text-muted-foreground/60' : 'text-muted-foreground')} />
        <span className="truncate">{list.name}</span>
        {insideSelectedFolder && (
          <span className="ml-auto text-[11px] text-muted-foreground/70">via folder</span>
        )}
      </label>
    );
  };

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <Link2 className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-medium">Connect to ClickUp</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Pick where this brand's campaign tasks live — a whole folder, multiple lists, or both.
        </p>
      </div>

      <Alert className="bg-muted/50 border-muted">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Selecting a folder includes every list inside it — including lists created later.
        </AlertDescription>
      </Alert>

      {/* Space selector */}
      <div className="space-y-1.5">
        <Label className="text-sm">Space</Label>
        <select
          value={selectedSpaceId}
          onChange={(e) => handleSpaceChange(e.target.value)}
          className="w-full h-8 text-[13px] border rounded-md px-3 bg-background"
          disabled={isLoadingData && spaces.length === 0}
        >
          <option value="">Select a space...</option>
          {spaces.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Hierarchy: folders (checkable, expandable) + folderless lists (checkable) */}
      {selectedSpaceId && (folders.length > 0 || folderlessLists.length > 0) && (
        <div className="space-y-1.5">
          <Label className="text-sm">Folders &amp; lists</Label>
          <div className="border rounded-md max-h-56 overflow-y-auto p-1 space-y-0.5">
            {folders.map(folder => {
              const folderSelected = selectedFolderId === folder.id;
              return (
                <div key={folder.id}>
                  <div
                    className={cn(
                      'flex items-center gap-2 rounded-md px-2 py-1.5 text-[12px] leading-none',
                      folderSelected ? 'bg-muted' : 'hover:bg-muted/60'
                    )}
                  >
                    <Checkbox
                      checked={folderSelected}
                      onCheckedChange={(c) => toggleFolderSelected(folder.id, c === true)}
                      className="h-3.5 w-3.5"
                    />
                    <button
                      type="button"
                      onClick={() => toggleFolderExpanded(folder.id)}
                      className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                    >
                      <ChevronRight
                        className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', folder.expanded && 'rotate-90')}
                      />
                      <FolderIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{folder.name}</span>
                    </button>
                    {folderSelected && (
                      <span className="text-[11px] text-muted-foreground shrink-0">whole folder</span>
                    )}
                    {folder.loading && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground shrink-0" />}
                  </div>
                  {folder.expanded && folder.lists && (
                    <div className="space-y-0.5 mt-0.5">
                      {folder.lists.length === 0 ? (
                        <p className="ml-8 px-2 py-1 text-[11px] text-muted-foreground">No lists in this folder</p>
                      ) : (
                        folder.lists.map(list =>
                          renderListRow(list, { insideSelectedFolder: folderSelected, indent: true })
                        )
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {folderlessLists.length > 0 && (
              <div className={cn(folders.length > 0 && 'pt-1 mt-1 border-t')}>
                {folders.length > 0 && (
                  <p className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground/70">Folderless lists</p>
                )}
                {folderlessLists.map(list => renderListRow(list))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Selection summary */}
      {hasSelection && (
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
          <Check className="h-3.5 w-3.5 text-foreground shrink-0" />
          <span className="text-[12px] text-foreground">Selected: {summaryText}</span>
        </div>
      )}

      {/* Loading indicator */}
      {isLoadingData && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading...</span>
        </div>
      )}

      {/* No spaces available */}
      {!isLoadingData && spaces.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-2">
          No spaces found in your workspace. Make sure your ClickUp workspace has spaces set up.
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2">
        <Button variant="ghost" onClick={onSkip} className="flex-1">
          Skip for now
        </Button>
        <Button
          onClick={handleSave}
          disabled={isSaving || !hasSelection}
          className="flex-1"
        >
          {isSaving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Continue'
          )}
        </Button>
      </div>
    </div>
  );
}
