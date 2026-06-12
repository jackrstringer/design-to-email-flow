// Per-brand campaign naming convention. Pick a preset, tweak it, see a live
// preview. The template is applied automatically when new campaigns enter the
// queue (process-campaign-queue), replacing the old title-QA flags.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, Type } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatCampaignName, NAMING_PRESETS } from '@/lib/naming';
import type { Brand } from '@/types/brand-assets';

const SAMPLE_CAMPAIGN = 'Summer Glow Sale';

interface CampaignNamingCardProps {
  brand: Brand;
  onBrandChange?: () => void;
}

export function CampaignNamingCard({ brand, onBrandChange }: CampaignNamingCardProps) {
  const saved = brand.namingConvention ?? null;
  const [template, setTemplate] = useState<string | null>(saved);
  const [saving, setSaving] = useState(false);
  const skipFirst = useRef(true);

  // Keep local state in sync if the brand refetches underneath us.
  useEffect(() => {
    setTemplate(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brand.id]);

  // Debounced persist whenever the template changes.
  useEffect(() => {
    if (skipFirst.current) { skipFirst.current = false; return; }
    if (template === saved) return;
    const t = setTimeout(async () => {
      setSaving(true);
      const { error } = await supabase
        .from('brands')
        .update({ naming_convention: template || null })
        .eq('id', brand.id);
      setSaving(false);
      if (error) {
        toast.error('Failed to save naming convention');
      } else {
        onBrandChange?.();
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template]);

  const preview = useMemo(() => {
    if (!template?.trim()) return null;
    return formatCampaignName(template, {
      brand: brand.name,
      name: SAMPLE_CAMPAIGN,
      date: new Date(),
    });
  }, [template, brand.name]);

  const matchesPreset = (t: string) => template === t;
  const isCustom = !!template && !NAMING_PRESETS.some((p) => p.template === template);

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="flex items-center gap-2 text-[13px] font-semibold tracking-tight">
            <Type className="h-3.5 w-3.5 text-muted-foreground" />
            Campaign naming
          </h3>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            New campaigns are renamed to this pattern automatically. Tokens:{' '}
            <code className="rounded bg-secondary px-1 py-px text-[10px]">{'{brand}'}</code>{' '}
            <code className="rounded bg-secondary px-1 py-px text-[10px]">{'{name}'}</code>{' '}
            <code className="rounded bg-secondary px-1 py-px text-[10px]">{'{date:MM.DD}'}</code>{' '}
            <code className="rounded bg-secondary px-1 py-px text-[10px]">{'{month}'}</code>{' '}
            <code className="rounded bg-secondary px-1 py-px text-[10px]">{'{year}'}</code>
          </p>
        </div>
        {saving && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />}
      </div>

      <div className="mt-4 space-y-1">
        {/* Off */}
        <button
          type="button"
          onClick={() => setTemplate(null)}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors duration-150',
            !template ? 'border-foreground/25 bg-secondary/50' : 'border-transparent hover:bg-secondary/40',
          )}
        >
          <span className={cn(
            'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
            !template ? 'border-foreground bg-foreground' : 'border-input',
          )}>
            {!template && <Check className="h-2.5 w-2.5 text-background" />}
          </span>
          <span className="text-[13px] text-muted-foreground">No convention — keep names as sent</span>
        </button>

        {NAMING_PRESETS.map((p) => {
          const active = matchesPreset(p.template);
          return (
            <button
              key={p.template}
              type="button"
              onClick={() => setTemplate(p.template)}
              className={cn(
                'flex w-full items-center gap-2.5 rounded-md border px-3 py-2 text-left transition-colors duration-150',
                active ? 'border-foreground/25 bg-secondary/50' : 'border-transparent hover:bg-secondary/40',
              )}
            >
              <span className={cn(
                'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border',
                active ? 'border-foreground bg-foreground' : 'border-input',
              )}>
                {active && <Check className="h-2.5 w-2.5 text-background" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium">
                  {formatCampaignName(p.template, { brand: brand.name, name: SAMPLE_CAMPAIGN })}
                </span>
                <span className="block truncate font-mono text-[10px] text-muted-foreground/80">{p.template}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Customize */}
      <div className="mt-3 border-t pt-3">
        <div className="flex items-center gap-2">
          <span className="shrink-0 text-[11px] font-medium text-muted-foreground">
            {isCustom ? 'Custom' : 'Customize'}
          </span>
          <Input
            value={template ?? ''}
            onChange={(e) => setTemplate(e.target.value || null)}
            placeholder="{brand} | {date:MM.DD} | {name}"
            className="h-8 flex-1 font-mono text-[12px]"
          />
          {template && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-[11px] text-muted-foreground"
              onClick={() => setTemplate(null)}
            >
              Clear
            </Button>
          )}
        </div>
        {preview && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Preview{' '}
            <span className="ml-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-foreground">
              {preview}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
