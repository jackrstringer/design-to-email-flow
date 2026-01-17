import { StatusSelector } from './StatusSelector';
import { InlineEditableText } from './InlineEditableText';
import { InlineDropdownSelector } from './InlineDropdownSelector';
import { ExternalLinksIndicator } from './ExternalLinksIndicator';
import { SpellingIndicator } from './SpellingIndicator';
import { SegmentSetSelector, SegmentPreset } from './SegmentSetSelector';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ExternalLink, Copy } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';

interface ColumnWidths {
  status: number;
  thumbnail: number;
  name: number;
  client: number;
  segmentSet: number;
  subject: number;
  previewText: number;
  links: number;
  external: number;
  spelling: number;
  klaviyo: number;
}

interface QueueRowProps {
  item: CampaignQueueItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: () => void;
  columnWidths: ColumnWidths;
  presets: SegmentPreset[];
  isSelected: boolean;
  onSelect: (id: string, selected: boolean) => void;
}

export function QueueRow({ 
  item, 
  isExpanded, 
  onToggleExpand, 
  onUpdate, 
  columnWidths, 
  presets,
  isSelected,
  onSelect
}: QueueRowProps) {
  const slices = (item.slices as Array<{ link?: string }>) || [];
  const linkCount = slices.filter(s => s.link).length;

  // Get brand info from joined data
  const brandName = (item as any).brands?.name;
  const brandDomain = (item as any).brands?.domain;
  const brandColor = (item as any).brands?.primary_color || '#6b7280';

  // Parse spelling errors
  const spellingErrors = item.spelling_errors as Array<{ text: string }> | null;

  // Get the selected preset - use saved one, or auto-select default
  const selectedPresetId = item.selected_segment_preset_id || presets.find(p => p.is_default)?.id || null;

  const handleNameSave = async (newName: string) => {
    const { error } = await supabase
      .from('campaign_queue')
      .update({ name: newName })
      .eq('id', item.id);

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

  return (
    <div 
      className={cn(
        "group flex h-10 items-center bg-white border-b border-gray-100 text-[13px] text-gray-900",
        "hover:bg-gray-50 transition-colors cursor-pointer",
        isExpanded && "bg-blue-50/50 border-b-blue-100",
        isSelected && "bg-blue-50"
      )}
      onClick={onToggleExpand}
    >
      {/* Checkbox column - visible on hover or when selected */}
      <div 
        className="w-8 flex-shrink-0 px-2 flex items-center justify-center" 
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onSelect(item.id, checked as boolean)}
          className={cn(
            "transition-opacity",
            isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
        />
      </div>
      
      {/* Status */}
      <div 
        className="px-2 flex-shrink-0" 
        style={{ width: columnWidths.status }}
        onClick={(e) => e.stopPropagation()}
      >
        <StatusSelector item={item} onUpdate={onUpdate} />
      </div>
      
      {/* Thumbnail */}
      <div className="px-2 flex-shrink-0" style={{ width: columnWidths.thumbnail }}>
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name || 'Campaign preview'}
            className="h-7 w-5 object-cover object-top rounded-sm border border-gray-200"
          />
        ) : (
          <div className="h-7 w-5 bg-gray-100 rounded-sm border border-gray-200" />
        )}
      </div>
      
      {/* Name */}
      <div 
        className="relative px-2 flex-shrink-0 overflow-hidden" 
        style={{ width: columnWidths.name }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Text flows naturally, no truncation - only clipped by container overflow */}
        <InlineEditableText
          value={item.name || 'Untitled Campaign'}
          onSave={handleNameSave}
          className="text-[13px] whitespace-nowrap"
        />
        {/* Open button - absolutely positioned, appears on row hover with solid bg */}
        <button
          className={cn(
            "absolute right-0 top-0 bottom-0 flex items-center",
            "pl-4 pr-2 text-[11px] text-gray-500 hover:text-gray-700",
            "opacity-0 group-hover:opacity-100 transition-opacity",
            isExpanded ? "bg-blue-50/50" : isSelected ? "bg-blue-50" : "bg-white"
          )}
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
        >
          Open ›
        </button>
      </div>
      
      {/* Client (Brand Name) */}
      <div 
        className="px-2 flex-shrink-0" 
        style={{ width: columnWidths.client }}
      >
        {brandName ? (
          <span 
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium truncate max-w-full shadow-sm"
            style={{ 
              background: `linear-gradient(135deg, ${brandColor}18 0%, ${brandColor}08 100%)`,
              color: brandColor,
              boxShadow: `0 1px 2px ${brandColor}12`
            }}
          >
            <span 
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: brandColor }}
            />
            {brandName}
          </span>
        ) : '—'}
      </div>

      {/* Segment Set */}
      <div 
        className="px-2 flex-shrink-0" 
        style={{ width: columnWidths.segmentSet }}
        onClick={(e) => e.stopPropagation()}
      >
        <SegmentSetSelector
          presets={presets}
          selectedPresetId={selectedPresetId}
          brandId={item.brand_id}
          onSelect={handleSegmentPresetSelect}
          disabled={item.status === 'processing'}
        />
      </div>
      
      {/* Subject Line */}
      <div 
        className="px-2 flex-shrink-0" 
        style={{ width: columnWidths.subject }}
        onClick={(e) => e.stopPropagation()}
      >
        <InlineDropdownSelector
          selected={item.selected_subject_line}
          options={item.generated_subject_lines}
          provided={item.provided_subject_line}
          onSelect={handleSubjectLineSelect}
          placeholder="Select subject..."
          isProcessing={item.status === 'processing'}
          processingStep={item.processing_step}
          isAiGenerated={item.copy_source === 'ai' || (!item.copy_source && !item.provided_subject_line)}
        />
      </div>

      {/* Preview Text */}
      <div 
        className="px-2 flex-shrink-0" 
        style={{ width: columnWidths.previewText }}
        onClick={(e) => e.stopPropagation()}
      >
        <InlineDropdownSelector
          selected={item.selected_preview_text}
          options={item.generated_preview_texts}
          provided={item.provided_preview_text}
          onSelect={handlePreviewTextSelect}
          placeholder="Select preview..."
          isProcessing={item.status === 'processing'}
          processingStep={item.processing_step}
          isAiGenerated={item.copy_source === 'ai' || (!item.copy_source && !item.provided_preview_text)}
        />
      </div>
      
      {/* Links - just count */}
      <div 
        className="px-2 flex-shrink-0 text-center text-gray-600" 
        style={{ width: columnWidths.links }}
      >
        {linkCount > 0 ? linkCount : '—'}
      </div>
      
      {/* External Links Indicator */}
      <div 
        className="px-2 flex-shrink-0" 
        style={{ width: columnWidths.external }}
        onClick={(e) => e.stopPropagation()}
      >
        <ExternalLinksIndicator slices={slices} brandDomain={brandDomain} />
      </div>
      
      {/* Spelling Indicator */}
      <div 
        className="px-2 flex-shrink-0" 
        style={{ width: columnWidths.spelling }}
        onClick={(e) => e.stopPropagation()}
      >
        <SpellingIndicator spellingErrors={spellingErrors} />
      </div>

      {/* Klaviyo Link */}
      <div 
        className="px-2 flex-shrink-0 flex items-center group/klaviyo" 
        style={{ width: columnWidths.klaviyo }}
        onClick={(e) => e.stopPropagation()}
      >
        {(item.status === 'sent_to_klaviyo' || item.status === 'closed') && (item.klaviyo_campaign_url || item.klaviyo_campaign_id) ? (() => {
          const klaviyoUrl = item.klaviyo_campaign_url || `https://www.klaviyo.com/email-template-editor/campaign/${item.klaviyo_campaign_id}/content/edit`;
          const displayText = `campaign/${item.klaviyo_campaign_id || '...'}`;
          return (
            <div className="flex items-center gap-1.5 min-w-0 w-full">
              <a
                href={klaviyoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-gray-500 hover:text-blue-600 flex-shrink-0"
                title="Open in Klaviyo"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
              <a
                href={klaviyoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-blue-600 hover:text-blue-800 hover:underline truncate flex-1 min-w-0"
                title={klaviyoUrl}
              >
                {displayText}
              </a>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(klaviyoUrl);
                  toast.success('URL copied');
                }}
                className="opacity-0 group-hover/klaviyo:opacity-100 transition-opacity p-0.5 hover:bg-gray-100 rounded flex-shrink-0"
                title="Copy URL"
              >
                <Copy className="h-3 w-3 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
          );
        })() : (
          <span className="text-gray-400">—</span>
        )}
      </div>
    </div>
  );
}
