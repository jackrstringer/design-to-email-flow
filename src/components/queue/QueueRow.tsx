import { StatusSelector } from './StatusSelector';
import { InlineEditableText } from './InlineEditableText';
import { InlineDropdownSelector } from './InlineDropdownSelector';
import { SegmentSetSelector, SegmentPreset } from './SegmentSetSelector';
import { LinksSummaryPopover } from './LinksSummaryPopover';
import { ProcessingTimer } from './ProcessingTimer';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { supabase } from '@/integrations/supabase/client';
import { isRealLink } from '@/lib/links';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ArrowUpRight, ChevronRight, Columns, AlertTriangle } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

export type QueueDensity = 'comfortable' | 'compact';

interface QueueRowProps {
  item: CampaignQueueItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: () => void;
  density: QueueDensity;
  presets: SegmentPreset[];
  liveSegmentIds: Set<string>;
  liveSegmentsLoaded: boolean;
  isSelected: boolean;
  onSelect: (id: string, selected: boolean, shiftKey?: boolean) => void;
  showTimers: boolean;
  onToggleTimers: () => void;
}

/** Always-visible QA status chip: green dot when clean, amber when not. */
function QaChip({
  ok,
  label,
  title,
  dense,
}: {
  ok: boolean;
  label: string;
  title: string;
  dense?: boolean;
}) {
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium tabular-nums',
            dense ? 'h-5 px-2 text-[10.5px]' : 'h-6 px-2.5 text-[11px]',
            ok ? 'bg-muted text-foreground/65' : 'bg-warning/15 font-semibold text-warning',
          )}
        >
          <span className={cn('h-[5px] w-[5px] rounded-full', ok ? 'bg-success' : 'bg-warning')} />
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">
        {title}
      </TooltipContent>
    </Tooltip>
  );
}

export function QueueRow({
  item,
  isExpanded,
  onToggleExpand,
  onUpdate,
  density,
  presets,
  liveSegmentIds,
  liveSegmentsLoaded,
  isSelected,
  onSelect,
  showTimers,
}: QueueRowProps) {
  const slices = (item.slices as Array<{ link?: string; totalColumns?: number; multiCtaWarning?: string }>) || [];

  const hasMultiColumnBlocks = slices.some((s) => (s.totalColumns ?? 1) > 1);
  const hasMultiCtaWarning = slices.some((s) => s.multiCtaWarning);

  const brandName = (item as any).brands?.name;
  const brandDomain = (item as any).brands?.domain;

  const spellingErrors = item.spelling_errors as Array<{ text: string }> | null;
  const spellingCount = spellingErrors?.length || 0;

  const realLinks = slices.filter((s) => isRealLink(s.link));
  const externalCount = brandDomain
    ? new Set(realLinks.filter((s) => !s.link!.includes(brandDomain)).map((s) => s.link)).size
    : 0;

  const selectedPresetId = item.selected_segment_preset_id || presets.find((p) => p.is_default)?.id || null;

  const isProcessing = item.status === 'processing';
  const compact = density === 'compact';

  const handleNameSave = async (newName: string) => {
    const { error } = await supabase.from('campaign_queue').update({ name: newName }).eq('id', item.id);
    if (error) {
      toast.error('Failed to update name');
      return false;
    }
    onUpdate();
    return true;
  };

  const handleSubjectLineSelect = async (value: string) => {
    const { error } = await supabase
      .from('campaign_queue')
      .update({ selected_subject_line: value })
      .eq('id', item.id);
    if (error) {
      toast.error('Failed to update subject line');
      return false;
    }
    onUpdate();
    return true;
  };

  const handlePreviewTextSelect = async (value: string) => {
    const { error } = await supabase
      .from('campaign_queue')
      .update({ selected_preview_text: value })
      .eq('id', item.id);
    if (error) {
      toast.error('Failed to update preview text');
      return false;
    }
    onUpdate();
    return true;
  };

  const handleSegmentPresetSelect = async (presetId: string) => {
    const { error } = await supabase
      .from('campaign_queue')
      .update({ selected_segment_preset_id: presetId })
      .eq('id', item.id);
    if (error) {
      toast.error('Failed to update segment preset');
      return;
    }
    onUpdate();
  };

  // ── shared fragments ─────────────────────────────────────────────────────

  const checkbox = (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center transition-opacity',
        compact ? 'w-6' : 'w-7',
        isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
      )}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(item.id, !isSelected, e.shiftKey);
      }}
    >
      <Checkbox checked={isSelected} className="pointer-events-none rounded-[5px]" />
    </div>
  );

  const thumbnail = (
    <div className="relative shrink-0">
      {(hasMultiCtaWarning || hasMultiColumnBlocks) && !compact && (
        <Tooltip delayDuration={150}>
          <TooltipTrigger asChild>
            <span className="absolute -right-1.5 -top-1.5 z-10 flex h-4 w-4 items-center justify-center rounded-full bg-card text-muted-foreground shadow-card">
              {hasMultiCtaWarning ? (
                <AlertTriangle className="h-2.5 w-2.5 text-warning" />
              ) : (
                <Columns className="h-2.5 w-2.5" />
              )}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {hasMultiCtaWarning ? 'Some slices may have multiple CTAs that need splitting' : 'Contains multi-column blocks'}
          </TooltipContent>
        </Tooltip>
      )}
      {item.image_url ? (
        <img
          src={item.image_url}
          alt=""
          loading="lazy"
          className={cn(
            'object-cover object-top shadow-[inset_0_0_0_1px_hsl(0_0%_0%/0.07)]',
            compact ? 'h-7 w-5 rounded-[5px]' : 'h-[54px] w-[42px] rounded-[9px]',
          )}
        />
      ) : (
        <div
          className={cn(
            'bg-muted shadow-[inset_0_0_0_1px_hsl(0_0%_0%/0.05)]',
            compact ? 'h-7 w-5 rounded-[5px]' : 'h-[54px] w-[42px] rounded-[9px]',
          )}
        />
      )}
    </div>
  );

  const brandChip = brandName ? (
    <span
      className={cn(
        'inline-flex max-w-full items-center rounded-full bg-muted font-medium text-foreground/70',
        compact ? 'h-5 gap-1 px-1.5 pl-[3px] text-[10.5px]' : 'h-6 gap-1.5 px-2.5 pl-1 text-[11px]',
      )}
    >
      <span
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground',
          compact ? 'h-3.5 w-3.5 text-[7.5px]' : 'h-[17px] w-[17px] text-[8.5px]',
        )}
      >
        {brandName.charAt(0).toUpperCase()}
      </span>
      <span className="truncate">{brandName}</span>
    </span>
  ) : (
    <span className="text-[11px] text-muted-foreground/60">—</span>
  );

  const statusCell = (
    <div onClick={(e) => e.stopPropagation()}>
      <StatusSelector
        item={item}
        onUpdate={onUpdate}
        presets={presets}
        liveSegmentIds={liveSegmentIds}
        liveSegmentsLoaded={liveSegmentsLoaded}
      />
    </div>
  );

  const segmentCell = (
    <div onClick={(e) => e.stopPropagation()} className="min-w-0">
      <SegmentSetSelector
        presets={presets}
        selectedPresetId={selectedPresetId}
        brandId={item.brand_id}
        liveSegmentIds={liveSegmentIds}
        liveSegmentsLoaded={liveSegmentsLoaded}
        onSelect={handleSegmentPresetSelect}
        disabled={isProcessing}
      />
    </div>
  );

  const linksCell = <LinksSummaryPopover slices={slices} brandDomain={brandDomain} dense={compact} />;

  const spellingCell = (
    <QaChip
      dense={compact}
      ok={spellingCount === 0}
      label={
        spellingCount === 0
          ? compact
            ? 'Aa'
            : '0 errors'
          : compact
            ? String(spellingCount)
            : `${spellingCount} spelling`
      }
      title={
        spellingCount === 0
          ? 'Spelling QA passed — no errors found'
          : `${spellingCount} possible spelling error${spellingCount === 1 ? '' : 's'} — open to review`
      }
    />
  );

  const klaviyoPill = (() => {
    if (!((item.status === 'sent_to_klaviyo' || item.status === 'closed') && (item.klaviyo_campaign_url || item.klaviyo_campaign_id)))
      return null;
    const url =
      item.klaviyo_campaign_url ||
      `https://www.klaviyo.com/email-template-editor/campaign/${item.klaviyo_campaign_id}/content/edit`;
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={cn(
          'inline-flex shrink-0 items-center gap-1 rounded-full bg-primary font-medium text-primary-foreground transition-opacity hover:opacity-85',
          compact ? 'h-5 px-2 text-[10.5px]' : 'h-6 px-2.5 text-[11px]',
        )}
        title="Open campaign in Klaviyo"
      >
        Klaviyo
        <ArrowUpRight className={cn('opacity-60', compact ? 'h-2.5 w-2.5' : 'h-[11px] w-[11px]')} strokeWidth={2.5} />
      </a>
    );
  })();

  const timer = showTimers ? (
    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
      <ProcessingTimer
        createdAt={item.created_at}
        completedAt={(item as any).processing_completed_at}
        status={item.status}
        visible={showTimers}
        onToggle={() => {}}
      />
    </span>
  ) : null;

  const chevron = (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-muted text-foreground/60 transition-colors group-hover:bg-secondary group-hover:text-foreground',
        compact ? 'h-5 w-5' : 'h-[26px] w-[26px]',
        isExpanded && 'bg-primary text-primary-foreground group-hover:bg-primary group-hover:text-primary-foreground',
      )}
    >
      <ChevronRight
        className={cn('transition-transform duration-200', compact ? 'h-3 w-3' : 'h-[11px] w-[11px]', isExpanded && 'rotate-90')}
        strokeWidth={2.5}
      />
    </span>
  );

  const tileClasses = cn(
    'row-tile group flex cursor-pointer items-center',
    compact ? 'gap-2.5 rounded-xl py-1.5 pl-1 pr-2.5' : 'gap-3.5 rounded-2xl py-2.5 pl-1.5 pr-4',
    isProcessing && 'opacity-[0.92]',
    isExpanded && 'rounded-b-none shadow-none',
    isSelected && 'bg-secondary/60',
  );

  // Field order per Jack: status → thumbnail → title/SL/PT → client →
  // segment set → links (green = all on domain) → spelling QA.

  // ── compact: one line, everything visible, engineer density ─────────────
  if (compact) {
    return (
      <div className={tileClasses} onClick={onToggleExpand}>
        {checkbox}
        <div className="w-[118px] shrink-0">{statusCell}</div>
        {thumbnail}
        <div className="w-[180px] shrink-0 xl:w-[220px]" onClick={(e) => e.stopPropagation()}>
          <InlineEditableText
            value={item.name || 'Untitled Campaign'}
            onSave={handleNameSave}
            className="!text-[12px] font-semibold"
          />
        </div>
        <div className="min-w-0 flex-1" onClick={(e) => e.stopPropagation()}>
          <InlineDropdownSelector
            selected={item.selected_subject_line}
            options={item.generated_subject_lines}
            provided={item.provided_subject_line}
            onSelect={handleSubjectLineSelect}
            placeholder="Subject…"
            isProcessing={isProcessing}
            processingStep={item.processing_step}
            isAiGenerated={item.copy_source === 'ai' || (!item.copy_source && !item.provided_subject_line)}
            isClickUpSource={item.copy_source === 'clickup'}
            textClassName="!text-[12px]"
          />
        </div>
        <div className="hidden min-w-0 flex-1 lg:block" onClick={(e) => e.stopPropagation()}>
          <InlineDropdownSelector
            selected={item.selected_preview_text}
            options={item.generated_preview_texts}
            provided={item.provided_preview_text}
            onSelect={handlePreviewTextSelect}
            placeholder="Preview…"
            isProcessing={isProcessing}
            processingStep={item.processing_step}
            isAiGenerated={item.copy_source === 'ai' || (!item.copy_source && !item.provided_preview_text)}
            isClickUpSource={item.copy_source === 'clickup'}
            textClassName="!text-[12px] text-muted-foreground"
          />
        </div>
        <div className="w-[108px] shrink-0">{brandChip}</div>
        <div className="hidden w-[120px] shrink-0 md:block">{segmentCell}</div>
        <div className="flex shrink-0 items-center justify-end gap-1.5">
          {linksCell}
          {spellingCell}
          {klaviyoPill}
          {timer}
        </div>
        {chevron}
      </div>
    );
  }

  // ── comfortable: two-line object row ─────────────────────────────────────
  return (
    <div className={tileClasses} onClick={onToggleExpand}>
      {checkbox}
      <div className="w-[136px] shrink-0">{statusCell}</div>
      {thumbnail}

      <div className="min-w-0 flex-[1.6]">
        <div onClick={(e) => e.stopPropagation()} className="-ml-1 max-w-full pr-2">
          <InlineEditableText
            value={item.name || 'Untitled Campaign'}
            onSave={handleNameSave}
            className="!text-[13px] font-semibold tracking-[-0.005em]"
          />
        </div>
        {/* Jack's spec: title, SL, PT stacked — each on its own line, full width */}
        <div className="-ml-1 mt-px min-w-0 pr-2" onClick={(e) => e.stopPropagation()}>
          <InlineDropdownSelector
            selected={item.selected_subject_line}
            options={item.generated_subject_lines}
            provided={item.provided_subject_line}
            onSelect={handleSubjectLineSelect}
            placeholder="Select subject…"
            isProcessing={isProcessing}
            processingStep={item.processing_step}
            isAiGenerated={item.copy_source === 'ai' || (!item.copy_source && !item.provided_subject_line)}
            isClickUpSource={item.copy_source === 'clickup'}
            textClassName="!text-[11.5px] text-muted-foreground"
          />
        </div>
        {!isProcessing && (
          <div className="-ml-1 min-w-0 pr-2" onClick={(e) => e.stopPropagation()}>
            <InlineDropdownSelector
              selected={item.selected_preview_text}
              options={item.generated_preview_texts}
              provided={item.provided_preview_text}
              onSelect={handlePreviewTextSelect}
              placeholder="Select preview…"
              isProcessing={isProcessing}
              processingStep={item.processing_step}
              isAiGenerated={item.copy_source === 'ai' || (!item.copy_source && !item.provided_preview_text)}
              isClickUpSource={item.copy_source === 'clickup'}
              textClassName="!text-[11.5px] text-muted-foreground/80"
            />
          </div>
        )}
      </div>

      <div className="hidden w-[124px] shrink-0 md:block">{brandChip}</div>
      <div className="hidden w-[144px] shrink-0 lg:block">{segmentCell}</div>

      <div className="flex shrink-0 items-center justify-end gap-2">
        {linksCell}
        {spellingCell}
        {klaviyoPill}
        {timer}
      </div>

      {chevron}
    </div>
  );
}
