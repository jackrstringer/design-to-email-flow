import { useState, useEffect } from 'react';
import { Key, Copy, Trash2, Check, Plus, Loader2, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ClickUpIntegrationCard } from '@/components/integrations/ClickUpIntegrationCard';
import { TeamCard } from '@/components/settings/TeamCard';

interface PluginToken {
  id: string;
  token: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}

export default function Settings() {
  const { user, updatePassword } = useAuth();

  // Password change state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (newPassword.length < 8) {
      setPasswordError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    setUpdatingPassword(true);
    const { error } = await updatePassword(newPassword);
    setUpdatingPassword(false);

    if (error) {
      toast.error(error.message);
    } else {
      toast.success('Password updated.');
      setNewPassword('');
      setConfirmPassword('');
    }
  };

  const [tokens, setTokens] = useState<PluginToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newlyGeneratedToken, setNewlyGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [serverUrlCopied, setServerUrlCopied] = useState(false);

  useEffect(() => {
    fetchTokens();
  }, [user]);

  const fetchTokens = async () => {
    if (!user) return;
    
    const { data, error } = await supabase
      .from('plugin_tokens')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      toast.error('Failed to load tokens');
      return;
    }
    
    setTokens(data || []);
    setLoading(false);
  };

  const handleGenerateToken = async () => {
    if (!user) return;
    
    setGenerating(true);
    
    const { data, error } = await supabase
      .from('plugin_tokens')
      .insert({
        user_id: user.id,
        name: 'Figma Plugin'
      })
      .select()
      .single();
    
    setGenerating(false);

    if (error) {
      toast.error('Failed to generate token');
      return;
    }
    
    setNewlyGeneratedToken(data.token);
    setTokens([data, ...tokens]);
    toast.success('Token generated! Copy it now - it won\'t be shown again.');
  };

  const handleCopyToken = async (token: string) => {
    await navigator.clipboard.writeText(token);
    setCopied(true);
    toast.success('Token copied to clipboard');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDeleteToken = async (id: string) => {
    if (!confirm('Are you sure you want to delete this token? The Figma plugin using this token will stop working.')) {
      return;
    }
    
    const { error } = await supabase
      .from('plugin_tokens')
      .delete()
      .eq('id', id);
    
    if (error) {
      toast.error('Failed to delete token');
      return;
    }
    
    setTokens(tokens.filter(t => t.id !== id));
    toast.success('Token deleted');
  };

  const maskToken = (token: string) => {
    return `${token.substring(0, 8)}...${token.substring(token.length - 4)}`;
  };

  const serverUrl = import.meta.env.VITE_SUPABASE_URL as string;

  const handleCopyServerUrl = async () => {
    await navigator.clipboard.writeText(serverUrl);
    setServerUrlCopied(true);
    toast.success('Server URL copied to clipboard');
    setTimeout(() => setServerUrlCopied(false), 2000);
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <header className="border-b bg-background shrink-0">
        <div className="px-6">
          <div className="flex h-12 items-center">
            <span className="text-sm font-medium">Integrations</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-auto p-6">
        <div className="max-w-3xl space-y-6">
          {/* ClickUp Integration */}
          <ClickUpIntegrationCard />

          {/* Figma Plugin Tokens */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                Figma plugin
              </CardTitle>
              <CardDescription>
                Connect the Sendr plugin so a selected frame lands in your queue in one click.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Install instructions */}
              <ol className="space-y-2.5 text-sm">
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">1</span>
                  <span className="pt-px">
                    In Figma: Plugins → Development → <span className="font-medium">Sendr — Design to Email</span>
                  </span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">2</span>
                  <span className="pt-px">Open Settings in the plugin</span>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">3</span>
                  <div className="flex-1 min-w-0 space-y-1.5 pt-px">
                    <span>Set the server URL:</span>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 truncate rounded-md border bg-muted/50 px-2.5 py-1.5 font-mono text-xs">
                        {serverUrl}
                      </code>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={handleCopyServerUrl}
                      >
                        {serverUrlCopied ? (
                          <Check className="h-3.5 w-3.5 text-foreground" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                </li>
                <li className="flex gap-3">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">4</span>
                  <span className="pt-px">Paste a token generated below</span>
                </li>
              </ol>

              <Separator />

              {/* Generate New Token */}
              <Button onClick={handleGenerateToken} disabled={generating}>
                {generating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Generate New Token
                  </>
                )}
              </Button>

              {/* Newly Generated Token (show once) */}
              {newlyGeneratedToken && (
                <div className="p-4 bg-foreground dark:bg-foreground border border-border dark:border-border rounded-lg">
                  <p className="text-sm font-medium text-foreground mb-2">
                    ✓ New token generated! Copy it now - this is the only time you'll see it.
                  </p>
                  <div className="flex items-center gap-2">
                    <Input 
                      value={newlyGeneratedToken} 
                      readOnly 
                      className="font-mono text-sm"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => handleCopyToken(newlyGeneratedToken)}
                    >
                      {copied ? (
                        <Check className="h-4 w-4 text-foreground" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              )}

              {/* Token List */}
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : tokens.length > 0 ? (
                <div className="space-y-2">
                  <Separator className="my-4" />
                  <p className="text-sm font-medium text-muted-foreground">Existing Tokens</p>
                  {tokens.map((token) => (
                    <div 
                      key={token.id}
                      className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                    >
                      <div className="flex-1">
                        <p className="text-sm font-medium">{token.name || 'Figma Plugin'}</p>
                        <p className="text-xs text-muted-foreground font-mono">
                          {maskToken(token.token)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Created {new Date(token.created_at).toLocaleDateString()}
                          {token.last_used_at && ` • Last used ${new Date(token.last_used_at).toLocaleDateString()}`}
                        </p>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => handleDeleteToken(token.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : !newlyGeneratedToken && (
                <p className="text-sm text-muted-foreground py-4">
                  No tokens yet. Generate one to connect your Figma plugin.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Password */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="h-5 w-5" />
                Password
              </CardTitle>
              <CardDescription>
                Update your account password. You'll remain signed in after changing it.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleUpdatePassword} className="space-y-4 max-w-sm">
                <div className="space-y-2">
                  <Label htmlFor="settings-new-password">New password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="settings-new-password"
                      type="password"
                      placeholder="••••••••"
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setPasswordError(null); }}
                      className="pl-10"
                      required
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Must be at least 8 characters</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="settings-confirm-password">Confirm password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="settings-confirm-password"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => { setConfirmPassword(e.target.value); setPasswordError(null); }}
                      className="pl-10"
                      required
                    />
                  </div>
                </div>
                {passwordError && (
                  <p className="text-xs text-destructive">{passwordError}</p>
                )}
                <Button type="submit" disabled={updatingPassword}>
                  {updatingPassword ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Updating...
                    </>
                  ) : (
                    'Update password'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>

          <TeamCard />
        </div>
      </main>
    </div>
  );
}
