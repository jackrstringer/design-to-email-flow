// Single source of truth for how the brand-memory agents present in the UI.
// The agents render as one assistant ("Brand memory") with distinct activities.

import { Brain, ShieldCheck, RefreshCw, Globe, type LucideIcon } from 'lucide-react';

export type AgentKind = 'learn' | 'qa' | 'refresh' | 'recrawl';

export const AGENT_META: Record<AgentKind, { label: string; icon: LucideIcon; badgeClass: string }> = {
  learn: {
    label: 'Learning',
    icon: Brain,
    badgeClass: 'bg-brand/10 text-brand border-brand/20',
  },
  qa: {
    label: 'QA review',
    icon: ShieldCheck,
    badgeClass: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/20',
  },
  refresh: {
    label: 'Maintenance',
    icon: RefreshCw,
    badgeClass: 'bg-success/10 text-success border-success/20',
  },
  recrawl: {
    label: 'Site recrawl',
    icon: Globe,
    badgeClass: 'bg-secondary text-muted-foreground border-border',
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
  error: { label: 'Error', badgeClass: 'bg-destructive/10 text-destructive border-destructive/25' },
  warning: { label: 'Warning', badgeClass: 'bg-warning/10 text-warning border-warning/25' },
  info: { label: 'Info', badgeClass: 'bg-muted text-muted-foreground border-border' },
} as const;
