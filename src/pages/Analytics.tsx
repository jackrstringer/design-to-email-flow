// Team analytics — oriented around time saved, Whispr-style. Hand-building
// a campaign (slice, link, alt text, QA, Klaviyo build) is ~45 minutes;
// Sendr does it in ~2. The hero number is the hours the team got back.

import { useQuery } from '@tanstack/react-query';
import { Clock, Send, Building2, Brain, Zap } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';

const MINUTES_SAVED_PER_CAMPAIGN = 43; // 45 manual − 2 with Sendr

interface WeekBucket {
  label: string;
  count: number;
}

function useTeamAnalytics() {
  return useQuery({
    queryKey: ['team-analytics'],
    staleTime: 60_000,
    queryFn: async () => {
      const [campaignsRes, brandsRes, knowledgeRes, eventsRes, profilesRes] = await Promise.all([
        supabase.from('campaign_queue').select('id, user_id, status, created_at, sent_to_klaviyo_at'),
        supabase.from('brands').select('id, name'),
        supabase.from('brand_knowledge').select('id', { count: 'exact', head: true }),
        supabase.from('knowledge_events').select('id', { count: 'exact', head: true }),
        supabase.from('profiles').select('id, email, role'),
      ]);
      const campaigns = campaignsRes.data ?? [];
      const shipped = campaigns.filter((c) => c.sent_to_klaviyo_at || c.status === 'sent_to_klaviyo');

      // Weekly throughput, last 8 weeks
      const weeks: WeekBucket[] = [];
      for (let i = 7; i >= 0; i--) {
        const start = new Date();
        start.setDate(start.getDate() - start.getDay() - i * 7);
        start.setHours(0, 0, 0, 0);
        const end = new Date(start);
        end.setDate(end.getDate() + 7);
        weeks.push({
          label: `${start.getMonth() + 1}/${start.getDate()}`,
          count: campaigns.filter((c) => {
            const t = c.created_at ? new Date(c.created_at) : null;
            return t && t >= start && t < end;
          }).length,
        });
      }

      // Power users: campaigns per person
      const byUser = new Map<string, number>();
      campaigns.forEach((c) => {
        if (c.user_id) byUser.set(c.user_id, (byUser.get(c.user_id) ?? 0) + 1);
      });
      const profiles = profilesRes.data ?? [];
      const leaderboard = [...byUser.entries()]
        .map(([id, count]) => ({
          email: profiles.find((p) => p.id === id)?.email ?? 'teammate',
          count,
          minutes: count * MINUTES_SAVED_PER_CAMPAIGN,
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      return {
        total: campaigns.length,
        shipped: shipped.length,
        brands: (brandsRes.data ?? []).length,
        lessons: knowledgeRes.count ?? 0,
        corrections: eventsRes.count ?? 0,
        hoursSaved: Math.round((campaigns.length * MINUTES_SAVED_PER_CAMPAIGN) / 60),
        weeks,
        leaderboard,
        teamSize: profiles.length,
      };
    },
  });
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof Clock; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1.5 text-lg font-semibold tracking-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

export default function Analytics() {
  const { data, isLoading } = useTeamAnalytics();

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-lg" />)}
        </div>
        <Skeleton className="h-48 rounded-lg" />
      </div>
    );
  }

  const maxWeek = Math.max(1, ...data.weeks.map((w) => w.count));

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Analytics</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          What the team got back by not hand-building emails.
        </p>
      </div>

      {/* Hero: time saved */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3.5 w-3.5" /> Time saved
        </div>
        <p className="mt-1 text-3xl font-semibold tracking-tight">
          {data.hoursSaved}<span className="ml-1 text-base font-medium text-muted-foreground">hours</span>
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          ≈ {MINUTES_SAVED_PER_CAMPAIGN} min saved per campaign vs slicing, linking, QA-ing and building by hand.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat icon={Send} label="Campaigns processed" value={String(data.total)} sub={`${data.shipped} shipped to Klaviyo`} />
        <Stat icon={Building2} label="Active brands" value={String(data.brands)} />
        <Stat icon={Brain} label="Lessons learned" value={String(data.lessons)} sub={`${data.corrections} corrections captured`} />
        <Stat icon={Zap} label="Team" value={String(data.teamSize)} sub="invite more in Settings" />
      </div>

      {/* Weekly throughput */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">Campaigns per week</p>
        <div className="mt-3 flex h-28 items-end gap-2">
          {data.weeks.map((w) => (
            <div key={w.label} className="flex flex-1 flex-col items-center gap-1">
              <span className="text-[10px] tabular-nums text-muted-foreground">{w.count || ''}</span>
              <div
                className="w-full rounded-t-md bg-brand/80 transition-all"
                style={{ height: `${Math.max(4, (w.count / maxWeek) * 80)}px` }}
              />
              <span className="text-[10px] text-muted-foreground">{w.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Power users */}
      <div className="rounded-lg border bg-card p-4">
        <p className="text-sm font-medium">Power users</p>
        <p className="text-xs text-muted-foreground">Most campaigns shipped — and the hours that earned back.</p>
        <div className="mt-3 divide-y">
          {data.leaderboard.map((u, i) => (
            <div key={u.email} className="flex items-center gap-3 py-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${i === 0 ? 'bg-brand text-brand-foreground' : 'bg-secondary text-foreground'}`}>
                {i + 1}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{u.email}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{u.count} campaigns</span>
              <span className="w-20 text-right text-xs font-medium tabular-nums">{Math.round(u.minutes / 60)}h saved</span>
            </div>
          ))}
          {data.leaderboard.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">No campaigns yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}
