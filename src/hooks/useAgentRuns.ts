import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AgentRun {
  id: string;
  agent: string;
  trigger: string;
  status: string;
  headline: string | null;
  created_at: string;
}

export function useAgentRuns(brandId: string | undefined) {
  return useQuery({
    queryKey: ['agent-runs', brandId],
    enabled: !!brandId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AgentRun[]> => {
      const { data, error } = await supabase
        .from('agent_runs')
        .select('id, agent, trigger, status, headline, created_at')
        .eq('brand_id', brandId!)
        .order('created_at', { ascending: false })
        .limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });
}
