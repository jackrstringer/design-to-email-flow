// Derived onboarding state — no extra tables, no drift. Each step's
// completion is computed from real data, so the checklist can never lie.
//
// Canonical setup order (each step unlocks value for the next):
//   1. Create a brand            — everything is brand-scoped
//   2. Connect Klaviyo           — required to push anything
//   3. Build the footer          — required for compliant sends (QA blocks without it)
//   4. Import the link index     — turns CTA links from "homepage" into deep links
//   5. Connect the Figma plugin  — the main way work enters the queue
//   6. Send your first campaign  — proof the loop works

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuthContext } from '@/contexts/AuthContext';

export interface OnboardingStep {
  key: 'brand' | 'klaviyo' | 'footer' | 'links' | 'plugin' | 'first_campaign';
  title: string;
  description: string;
  /** Where the user goes to complete it ({brandId} replaced when known). */
  href: string;
  complete: boolean;
  optional?: boolean;
}

export interface OnboardingStatus {
  steps: OnboardingStep[];
  completeCount: number;
  totalRequired: number;
  done: boolean;
  /** First incomplete step — the single thing to do next. */
  nextStep: OnboardingStep | null;
  firstBrandId: string | null;
}

export function useOnboardingStatus() {
  const { user } = useAuthContext();

  return useQuery({
    queryKey: ['onboarding-status', user?.id],
    enabled: !!user,
    staleTime: 1000 * 15,
    queryFn: async (): Promise<OnboardingStatus> => {
      const [brandsRes, tokensRes, campaignsRes] = await Promise.all([
        supabase
          .from('brands')
          .select('id, name, klaviyo_key_set, footer_configured, footer_html')
          .order('created_at', { ascending: true }),
        supabase.from('plugin_tokens').select('id, last_used_at').limit(10),
        supabase.from('campaign_queue').select('id, status').limit(25),
      ]);

      const brands = brandsRes.data ?? [];
      const firstBrand = brands[0] ?? null;
      const firstBrandId = firstBrand?.id ?? null;
      const brandPath = firstBrandId ? `/brands/${firstBrandId}` : '/brands';

      // Link index: any links indexed for any brand?
      let hasLinks = false;
      if (firstBrandId) {
        const { count } = await supabase
          .from('brand_link_index')
          .select('id', { count: 'exact', head: true });
        hasLinks = (count ?? 0) > 0;
      }

      const tokens = tokensRes.data ?? [];
      const pluginConnected = tokens.some((t) => t.last_used_at !== null);
      const campaigns = campaignsRes.data ?? [];
      const hasCampaign = campaigns.length > 0;

      const steps: OnboardingStep[] = [
        {
          key: 'brand',
          title: 'Create your first brand',
          description: 'Everything in Sendr — campaigns, links, knowledge — lives under a brand.',
          href: '/brands',
          complete: brands.length > 0,
        },
        {
          key: 'klaviyo',
          title: 'Connect Klaviyo',
          description: 'Add the brand’s private API key (stored encrypted) so Sendr can build templates and campaigns.',
          href: `${brandPath}/integrations`,
          complete: brands.some((b) => b.klaviyo_key_set),
        },
        {
          key: 'footer',
          title: 'Build the footer',
          description: 'A reusable, compliant footer (unsubscribe links included) appended to every send.',
          href: `${brandPath}/email`,
          complete: brands.some((b) => b.footer_configured || !!b.footer_html),
        },
        {
          key: 'links',
          title: 'Import the link index',
          description: 'Import the site’s pages so CTAs deep-link to real product pages instead of the homepage.',
          href: `${brandPath}/links`,
          complete: hasLinks,
        },
        {
          key: 'plugin',
          title: 'Connect the Figma plugin',
          description: 'Generate a token and paste it into the Sendr plugin — then sending a design is one click.',
          href: '/settings',
          complete: pluginConnected,
        },
        {
          key: 'first_campaign',
          title: 'Send your first campaign',
          description: 'Select a frame in Figma and hit "Send to queue" — Sendr slices, links, and QAs it.',
          href: '/queue',
          complete: hasCampaign,
        },
      ];

      const required = steps.filter((s) => !s.optional);
      const completeCount = required.filter((s) => s.complete).length;

      return {
        steps,
        completeCount,
        totalRequired: required.length,
        done: completeCount === required.length,
        nextStep: steps.find((s) => !s.complete) ?? null,
        firstBrandId,
      };
    },
  });
}
