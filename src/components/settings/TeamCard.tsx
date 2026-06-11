// Team management (v1): admins invite teammates by email; members and
// pending invites listed. Shared org workspaces land in phase 2.

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserPlus, Loader2, ShieldCheck } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export function TeamCard() {
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const team = useQuery({
    queryKey: ['team'],
    queryFn: async () => {
      const [profilesRes, invitesRes, meRes] = await Promise.all([
        supabase.from('profiles').select('id, email, role'),
        supabase.from('team_invites').select('id, email, role, accepted_user_id, created_at'),
        supabase.auth.getUser(),
      ]);
      const profiles = profilesRes.data ?? [];
      const myId = meRes.data.user?.id;
      return {
        members: profiles,
        isAdmin: profiles.find((p) => p.id === myId)?.role === 'admin',
        pending: (invitesRes.data ?? []).filter(
          (i) => !profiles.some((p) => p.email === i.email),
        ),
      };
    },
  });

  const handleInvite = async () => {
    if (!email.trim()) return;
    setInviting(true);
    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: email.trim() },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(`Invite sent to ${email.trim()}`);
      setEmail('');
      team.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Invite failed');
    } finally {
      setInviting(false);
    }
  };

  if (team.isLoading || !team.data) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team</CardTitle>
        <CardDescription>
          Invite teammates — they get their own login, and admins see team-wide analytics.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {team.data.isAdmin && (
          <div className="flex gap-2">
            <Input
              type="email"
              placeholder="teammate@redwood.so"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleInvite()}
            />
            <Button onClick={handleInvite} disabled={inviting || !email.trim()}>
              {inviting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <UserPlus className="mr-1.5 h-3.5 w-3.5" />}
              Invite
            </Button>
          </div>
        )}
        <div className="divide-y rounded-lg border">
          {team.data.members.map((m) => (
            <div key={m.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm">{m.email}</span>
              {m.role === 'admin' && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <ShieldCheck className="h-3 w-3" /> Admin
                </Badge>
              )}
            </div>
          ))}
          {team.data.pending.map((i) => (
            <div key={i.id} className="flex items-center gap-2 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">{i.email}</span>
              <Badge variant="outline" className="text-[10px]">Invited</Badge>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
