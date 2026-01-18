import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, ExternalLink, AlertCircle, Check, Link2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

interface BrandClickUpLocationSelectorProps {
  brandId: string;
  onComplete: () => void;
  onSkip: () => void;
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
  
  // Location selection
  const [spaces, setSpaces] = useState<{id: string; name: string}[]>([]);
  const [folders, setFolders] = useState<{id: string; name: string}[]>([]);
  const [lists, setLists] = useState<{id: string; name: string; folderless?: boolean}[]>([]);
  
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');
  const [selectedListId, setSelectedListId] = useState('');
  
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
        
        // If we have both, fetch spaces
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
    setSelectedFolderId('');
    setSelectedListId('');
    setFolders([]);
    setLists([]);
    
    if (!spaceId || !masterApiKey) return;
    
    setIsLoadingData(true);
    try {
      // Fetch folders
      const { data: foldersData } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'folders', clickupApiKey: masterApiKey, spaceId }
      });
      setFolders(foldersData?.folders || []);
      
      // Fetch folderless lists
      const { data: listsData } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'lists', clickupApiKey: masterApiKey, spaceId }
      });
      setLists(listsData?.lists || []);
    } catch (err) {
      console.error('Failed to fetch folders/lists:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleFolderChange = async (folderId: string) => {
    setSelectedFolderId(folderId);
    setSelectedListId('');
    
    if (!folderId || !masterApiKey) {
      // If no folder selected, show folderless lists
      if (selectedSpaceId) {
        setIsLoadingData(true);
        try {
          const { data } = await supabase.functions.invoke('get-clickup-hierarchy', {
            body: { type: 'lists', clickupApiKey: masterApiKey, spaceId: selectedSpaceId }
          });
          setLists(data?.lists || []);
        } catch (err) {
          console.error('Failed to fetch lists:', err);
        } finally {
          setIsLoadingData(false);
        }
      }
      return;
    }
    
    setIsLoadingData(true);
    try {
      const { data, error } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'lists', clickupApiKey: masterApiKey, folderId, spaceId: selectedSpaceId }
      });
      if (error) throw error;
      setLists(data?.lists || []);
    } catch (err) {
      console.error('Failed to fetch lists:', err);
    } finally {
      setIsLoadingData(false);
    }
  };

  const handleSave = async () => {
    if (!selectedListId) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('brands')
        .update({
          clickup_list_id: selectedListId,
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
        <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
          <Check className="h-6 w-6 text-green-600 dark:text-green-400" />
        </div>
        <p className="font-medium text-green-700 dark:text-green-300">ClickUp connected!</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="text-center space-y-2">
        <div className="w-12 h-12 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <Link2 className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-medium">Connect to ClickUp</h3>
        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
          Select the ClickUp list where campaign tasks for this brand are managed.
        </p>
      </div>
      
      <Alert className="bg-muted/50 border-muted">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="text-xs">
          This helps us automatically pull subject lines and preview text from your campaign tasks in ClickUp.
        </AlertDescription>
      </Alert>

      {/* Space selector */}
      <div className="space-y-1.5">
        <Label className="text-sm">Space</Label>
        <select
          value={selectedSpaceId}
          onChange={(e) => handleSpaceChange(e.target.value)}
          className="w-full h-9 text-sm border rounded-md px-3 bg-background"
          disabled={isLoadingData}
        >
          <option value="">Select a space...</option>
          {spaces.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {/* Folder selector (optional) */}
      {selectedSpaceId && folders.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-sm">Folder (optional)</Label>
          <select
            value={selectedFolderId}
            onChange={(e) => handleFolderChange(e.target.value)}
            className="w-full h-9 text-sm border rounded-md px-3 bg-background"
            disabled={isLoadingData}
          >
            <option value="">No folder (folderless lists)</option>
            {folders.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* List selector */}
      {selectedSpaceId && lists.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-sm">List</Label>
          <select
            value={selectedListId}
            onChange={(e) => setSelectedListId(e.target.value)}
            className="w-full h-9 text-sm border rounded-md px-3 bg-background"
            disabled={isLoadingData}
          >
            <option value="">Select a list...</option>
            {lists.map(l => (
              <option key={l.id} value={l.id}>
                {l.name}{l.folderless ? ' (folderless)' : ''}
              </option>
            ))}
          </select>
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
          disabled={isSaving || !selectedListId}
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
