import { useState, useEffect } from 'react';
import { Loader2, ExternalLink, Check, Eye, EyeOff, Link2, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export function ClickUpIntegrationCard() {
  const { user } = useAuth();
  
  const [apiKey, setApiKey] = useState('');
  const [workspaceId, setWorkspaceId] = useState('');
  const [showApiKey, setShowApiKey] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  
  const [workspaces, setWorkspaces] = useState<{id: string; name: string}[]>([]);
  const [selectedWorkspaceName, setSelectedWorkspaceName] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    fetchProfile();
  }, [user]);

  const fetchProfile = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('clickup_api_key, clickup_workspace_id')
        .eq('id', user.id)
        .single();
      
      if (error) throw error;
      
      if (data?.clickup_api_key) {
        setApiKey(data.clickup_api_key);
        setWorkspaceId(data.clickup_workspace_id || '');
        setIsConnected(true);
        
        // Fetch workspace name if connected
        if (data.clickup_workspace_id) {
          fetchWorkspaceName(data.clickup_api_key, data.clickup_workspace_id);
        }
      }
    } catch (error) {
      console.error('Failed to fetch profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchWorkspaceName = async (key: string, wsId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'workspaces', clickupApiKey: key }
      });
      if (!error && data?.workspaces) {
        const ws = data.workspaces.find((w: any) => w.id === wsId);
        if (ws) setSelectedWorkspaceName(ws.name);
        setWorkspaces(data.workspaces);
      }
    } catch (err) {
      console.error('Failed to fetch workspace name:', err);
    }
  };

  const handleConnect = async () => {
    if (!apiKey) {
      toast.error('Please enter your ClickUp API token');
      return;
    }
    
    setIsConnecting(true);
    try {
      // Validate API key by fetching workspaces
      const { data, error } = await supabase.functions.invoke('get-clickup-hierarchy', {
        body: { type: 'workspaces', clickupApiKey: apiKey }
      });
      
      if (error) throw error;
      
      if (!data?.workspaces || data.workspaces.length === 0) {
        toast.error('No workspaces found. Check your API token.');
        return;
      }
      
      setWorkspaces(data.workspaces);
      
      // Auto-select first workspace if only one
      if (data.workspaces.length === 1) {
        setWorkspaceId(data.workspaces[0].id);
        setSelectedWorkspaceName(data.workspaces[0].name);
      }
      
      toast.success('ClickUp connected! Select your workspace.');
    } catch (err) {
      console.error('ClickUp connection error:', err);
      toast.error('Failed to connect. Check your API token and try again.');
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSave = async () => {
    if (!workspaceId) {
      toast.error('Please select a workspace');
      return;
    }
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          clickup_api_key: apiKey,
          clickup_workspace_id: workspaceId,
        })
        .eq('id', user!.id);

      if (error) throw error;
      
      const ws = workspaces.find(w => w.id === workspaceId);
      setSelectedWorkspaceName(ws?.name || null);
      setIsConnected(true);
      toast.success('ClickUp integration saved!');
    } catch (error) {
      console.error('Failed to save:', error);
      toast.error('Failed to save ClickUp settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect ClickUp? Brands using this connection will need to be reconfigured.')) {
      return;
    }
    
    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          clickup_api_key: null,
          clickup_workspace_id: null,
        })
        .eq('id', user!.id);

      if (error) throw error;
      
      setApiKey('');
      setWorkspaceId('');
      setWorkspaces([]);
      setSelectedWorkspaceName(null);
      setIsConnected(false);
      toast.success('ClickUp disconnected');
    } catch (error) {
      console.error('Failed to disconnect:', error);
      toast.error('Failed to disconnect ClickUp');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            <CardTitle>ClickUp Integration</CardTitle>
          </div>
          {isConnected && (
            <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
              <Check className="h-3 w-3 mr-1" />
              Connected
            </Badge>
          )}
        </div>
        <CardDescription>
          Connect ClickUp to automatically pull subject lines and preview text from campaign tasks.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Connected state */}
        {isConnected && selectedWorkspaceName && (
          <div className="p-4 bg-muted/50 rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Connected Workspace</p>
                <p className="text-sm text-muted-foreground">{selectedWorkspaceName}</p>
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDisconnect}
                disabled={isSaving}
                className="text-destructive hover:text-destructive"
              >
                <Unlink className="h-4 w-4 mr-1" />
                Disconnect
              </Button>
            </div>
          </div>
        )}

        {/* Setup form */}
        {!isConnected && (
          <>
            {/* Instructions */}
            <Collapsible open={showInstructions} onOpenChange={setShowInstructions}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="text-sm text-primary p-0 h-auto">
                  {showInstructions ? 'Hide' : 'Show'} instructions
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="mt-3">
                <div className="p-4 bg-muted/50 rounded-lg space-y-3 text-sm">
                  <p className="font-medium">How to get your ClickUp API Token:</p>
                  <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                    <li>
                      Go to{' '}
                      <a 
                        href="https://app.clickup.com/settings/apps" 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-primary hover:underline inline-flex items-center gap-1"
                      >
                        ClickUp Settings → Apps
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                    <li>Click on "Generate" under "API Token"</li>
                    <li>Copy the generated token</li>
                    <li>Paste it in the field below</li>
                  </ol>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* API Token input */}
            <div className="space-y-2">
              <Label>API Token</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    type={showApiKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="pk_..."
                    className="pr-10 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <Button
                  onClick={handleConnect}
                  disabled={isConnecting || !apiKey}
                >
                  {isConnecting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Connecting...
                    </>
                  ) : (
                    'Connect'
                  )}
                </Button>
              </div>
            </div>

            {/* Workspace selector */}
            {workspaces.length > 0 && (
              <div className="space-y-2">
                <Label>Workspace</Label>
                <select
                  value={workspaceId}
                  onChange={(e) => {
                    setWorkspaceId(e.target.value);
                    const ws = workspaces.find(w => w.id === e.target.value);
                    setSelectedWorkspaceName(ws?.name || null);
                  }}
                  className="w-full h-10 text-sm border rounded-md px-3 bg-background"
                >
                  <option value="">Select a workspace...</option>
                  {workspaces.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Save button */}
            {workspaces.length > 0 && (
              <Button 
                onClick={handleSave} 
                disabled={isSaving || !workspaceId}
                className="w-full"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Integration'
                )}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
