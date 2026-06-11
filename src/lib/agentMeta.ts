// Single source of truth for how the brand-memory agents present in the UI.
// The agents render as one assistant ("Brand memory") with distinct activities.

import { Brain, ShieldCheck, RefreshCw, Globe, type LucideIcon } from 'lucide-react';

export type AgentKind = 'learn' | 'qa' | 'refresh' | 'recrawl';

export const AGENT_META: Record<AgentKind, { label: string; icon: LucideIcon; badgeClass: string }> = {
  learn: {
    label: 'Learning',
    icon: Brain,
    badgeClass: 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  },
  qa: {
    label: 'QA review',
    icon: ShieldCheck,
    badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  },
  refresh: {
    label: 'Maintenance',
    icon: RefreshCw,
    badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  },
  recrawl: {
    label: 'Site recrawl',
    icon: Globe,
    badgeClass: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
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
  error: { label: 'Error', badgeClass: 'bg-destructive/10 text-destructive border-destructive/20' },
  warning: { label: 'Warning', badgeClass: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20' },
  info: { label: 'Info', badgeClass: 'bg-muted text-muted-foreground border-border' },
} as const;
