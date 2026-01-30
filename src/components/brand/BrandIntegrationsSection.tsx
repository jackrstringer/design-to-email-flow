import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Key, Pencil, ExternalLink, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Brand } from '@/types/brand-assets';

interface BrandIntegrationsSectionProps {
  brand: Brand;
  onBrandChange: () => void;
}

export function BrandIntegrationsSection({ brand, onBrandChange }: BrandIntegrationsSectionProps) {
  const navigate = useNavigate();
  const [editApiKey, setEditApiKey] = useState(false);
  const [apiKeyValue, setApiKeyValue] = useState(brand.klaviyoApiKey || '');
  const [isSaving, setIsSaving] = useState(false);
  
  // ClickUp state
  const [masterClickupApiKey, setMasterClickupApiKey] = useState<string | null>(null);
  const [masterClickupWorkspaceId, setMasterClickupWorkspaceId] = useState<string | null>(null);
  const [clickupListId, setClickupListId] = useState(brand.clickupListId || '');
  const [clickupConnectedInfo, setClickupConnectedInfo] = useState<{ workspaceName: string; listName: string } | null>(null);
  const [isLoadingClickupData, setIsLoadingClickupData] = useState(false);
  const [isSavingClickup, setIsSavingClickup] = useState(false);
  const [isReconfiguring, setIsReconfiguring] = useState(false);
  const [clickupSpaces, setClickupSpaces] = useState<{id: string; name: string}[]>([]);
  const [clickupFolders, setClickupFolders] = useState<{id: string; name: string}[]>([]);
  const [clickupLists, setClickupLists] = useState<{id: string; name: string; folderless?: boolean}[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [selectedFolderId, setSelectedFolderId] = useState('');

  const maskedApiKey = brand.klaviyoApiKey 
    ? `pk_****${brand.klaviyoApiKey.slice(-4)}` 
    : null;

  useEffect(() => {
    fetchMasterClickUpConnection();
  }, [brand.id]);

  useEffect(() => {
    setClickupListId(brand.clickupListId || '');
    if (masterClickupApiKey && brand.clickupListId) {
      fetchClickupConnectedInfo(masterClickupApiKey, masterClickupWorkspaceId);
    } else {
      setClickupConnectedInfo(null);
    }
  }, [brand.clickupListId, masterClickupApiKey, masterClickupWorkspaceId]);

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
        
        if (profile.clickup_api_key && brand.clickupListId) {
          fetchClickupConnectedInfo(profile.clickup_api_key, profile.clickup_workspace_id);
        }
        
        if (profile.clickup_api_key && profile.clickup_workspace_id) {
          fetchClickupSpaces(profile.clickup_workspace_id, profile.clickup_api_key);
        }
      }
    } catch (err) {
      console.error('Failed to fetch master ClickUp connection:', err);
    }
  };

  const fetchClickupConnectedInfo = async (apiKey: string, workspaceId: string | null) => {
    if (!apiKey || !brand.clickupListId) return;
    
    try {
      const { data: wsData } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'workspaces', clickupApiKey: apiKey }
      });
      
      const workspaceName = wsData?.workspaces?.find(
        (w: { id: string; name: string }) => w.id === workspaceId
      )?.name || (workspaceId ? `Workspace ${workspaceId}` : 'Unknown');
      
      setClickupConnectedInfo({
        workspaceName,
        listName: `List ID: ${brand.clickupListId}`,
      });
    } catch (err) {
      console.error('Failed to fetch ClickUp connected info:', err);
      setClickupConnectedInfo({
        workspaceName: workspaceId ? `Workspace ${workspaceId}` : 'Unknown',
        listName: `List ID: ${brand.clickupListId}`,
      });
    }
  };

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
      const { data: foldersData } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'folders', clickupApiKey: masterClickupApiKey, spaceId }
      });
      setClickupFolders(foldersData?.folders || []);
      
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

  const handleSaveClickupSettings = async () => {
    setIsSavingClickup(true);
    try {
      const { error } = await supabase
        .from('brands')
        .update({ clickup_list_id: clickupListId || null })
        .eq('id', brand.id);

      if (error) throw error;
      
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
        .update({ clickup_list_id: null })
        .eq('id', brand.id);

      if (error) throw error;
      
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

  return (
    <div className="grid grid-cols-2 gap-6">
      {/* Klaviyo Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Key className="h-4 w-4 text-muted-foreground" />
            Klaviyo
          </CardTitle>
          <CardDescription className="text-xs">API key for pushing campaigns</CardDescription>
        </CardHeader>
        <CardContent>
          {maskedApiKey ? (
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm font-mono">{maskedApiKey}</span>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setEditApiKey(true)} className="h-7">
                <Pencil className="h-3 w-3 mr-1" />
                Edit
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setEditApiKey(true)} className="w-full">
              <Key className="h-3 w-3 mr-2" />
              Add API Key
            </Button>
          )}
        </CardContent>
      </Card>

      {/* ClickUp Card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <ExternalLink className="h-4 w-4 text-muted-foreground" />
            ClickUp
          </CardTitle>
          <CardDescription className="text-xs">Pull copy from tasks</CardDescription>
        </CardHeader>
        <CardContent>
          {!masterClickupApiKey ? (
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Set up ClickUp in Integrations first.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => navigate('/settings')}
              >
                <ExternalLink className="h-3 w-3 mr-2" />
                Go to Integrations
              </Button>
            </div>
          ) : clickupListId && clickupConnectedInfo && !isReconfiguring ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-xs">{clickupConnectedInfo.listName}</span>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => {
                    setIsReconfiguring(true);
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
                  className="h-7 text-xs text-destructive"
                  onClick={handleDisconnectClickup}
                  disabled={isSavingClickup}
                >
                  Disconnect
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
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

              {clickupFolders.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Folder (optional)</Label>
                  <select
                    value={selectedFolderId}
                    onChange={(e) => fetchClickupListsFromFolder(e.target.value)}
                    className="w-full h-8 text-xs border rounded px-2"
                  >
                    <option value="">No folder</option>
                    {clickupFolders.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {clickupLists.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">List</Label>
                  <select
                    value={clickupListId}
                    onChange={(e) => setClickupListId(e.target.value)}
                    className="w-full h-8 text-xs border rounded px-2"
                  >
                    <option value="">Select list...</option>
                    {clickupLists.map(l => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {clickupListId && (
                <Button size="sm" className="w-full" onClick={handleSaveClickupSettings} disabled={isSavingClickup}>
                  {isSavingClickup ? 'Saving...' : 'Save Location'}
                </Button>
              )}

              {isReconfiguring && (
                <Button variant="ghost" size="sm" className="w-full" onClick={() => setIsReconfiguring(false)}>
                  Cancel
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
    </div>
  );
}
