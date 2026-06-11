// Single source of truth for how the brand-memory agents present in the UI.
// The agents render as one assistant ("Brand memory") with distinct activities.

import { Brain, ShieldCheck, RefreshCw, Globe, type LucideIcon } from 'lucide-react';

export type AgentKind = 'learn' | 'qa' | 'refresh' | 'recrawl';

export const AGENT_META: Record<AgentKind, { label: string; icon: LucideIcon; badgeClass: string }> = {
  learn: {
    label: 'Learning',
    icon: Brain,
    badgeClass: 'bg-secondary text-foreground border-border',
  },
  qa: {
    label: 'QA review',
    icon: ShieldCheck,
    badgeClass: 'bg-secondary text-foreground border-border',
  },
  refresh: {
    label: 'Maintenance',
    icon: RefreshCw,
    badgeClass: 'bg-secondary text-foreground border-border',
  },
  recrawl: {
    label: 'Site recrawl',
    icon: Globe,
    badgeClass: 'bg-secondary text-foreground border-border',
  },
};

export type KnowledgeKind = 'voice' | 'style' | 'product' | 'promo' | 'link_rule' | 'mistake' | 'fact';

export const KNOWLEDGE_KIND_META: Record<KnowledgeKind, { label: string; description: string }> = {
  voice: { label: 'Voice', description: 'Tone and wording rules' },
  style: { label: 'Style', description: 'Visual and layout conventions' },
  product: { label: 'Product', description: 'Catalog facts' },
  promo: { label: 'Promo', description: 'Time-bound offers' },
  link_rule: { label: 'Link rule', description: 'Where CTAs should point' },
  mistake: { label: 'Mistake', description: 'Errors to avoid repeating' },
  fact: { label: 'Fact', description: 'Other durable brand knowledge' },
};

export type QaCategory = 'link' | 'date' | 'voice' | 'structure' | 'brand_rule' | 'spelling';

export const QA_SEVERITY_META = {
  error: { label: 'Error', badgeClass: 'bg-foreground text-background border-foreground' },
  warning: { label: 'Warning', badgeClass: 'bg-secondary text-foreground border-border' },
  info: { label: 'Info', badgeClass: 'bg-muted text-muted-foreground border-border' },
} as const;
