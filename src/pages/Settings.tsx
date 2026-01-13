import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Key, Copy, Trash2, ExternalLink, Check, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface PluginToken {
  id: string;
  token: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}

export default function Settings() {
  const navigate = useNavigate();
  const { user } = useAuth();
  
  const [tokens, setTokens] = useState<PluginToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [newlyGeneratedToken, setNewlyGeneratedToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto px-4">
          <div className="flex h-14 items-center">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <span className="ml-4 text-lg font-semibold tracking-tight">Settings</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="space-y-8">
          {/* Integrations Section */}
          <section>
            <h2 className="text-xl font-semibold mb-4">Integrations</h2>
            
            {/* Plugin Tokens */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Key className="h-5 w-5" />
                  Figma Plugin Tokens
                </CardTitle>
                <CardDescription>
                  Generate tokens to connect your Figma plugin. Each token can be used in one Figma installation.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
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
                  <div className="p-4 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-lg">
                    <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">
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
                          <Check className="h-4 w-4 text-green-600" />
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

          </section>
        </div>
      </main>
    </div>
  );
}
