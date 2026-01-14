import { StatusSelector } from './StatusSelector';
import { InlineEditableText } from './InlineEditableText';
import { InlineDropdownSelector } from './InlineDropdownSelector';
import { ExternalLinksIndicator } from './ExternalLinksIndicator';
import { SpellingIndicator } from './SpellingIndicator';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ColumnWidths {
  status: number;
  thumbnail: number;
  name: number;
  client: number;
  subject: number;
  previewText: number;
  links: number;
  external: number;
  spelling: number;
}

interface QueueRowProps {
  item: CampaignQueueItem;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: () => void;
  columnWidths: ColumnWidths;
}

export function QueueRow({ item, isExpanded, onToggleExpand, onUpdate, columnWidths }: QueueRowProps) {
  const slices = (item.slices as Array<{ link?: string }>) || [];
  const linkCount = slices.filter(s => s.link).length;

  // Get brand info from joined data
  const brandName = (item as any).brands?.name;
  const brandDomain = (item as any).brands?.domain;
  const brandColor = (item as any).brands?.primary_color || '#6b7280';

  // Parse spelling errors
  const spellingErrors = item.spelling_errors as Array<{ text: string }> | null;

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

  return (
    <div 
      className={cn(
        "flex h-10 items-center bg-white border-b border-gray-100 text-[13px] text-gray-900",
        "hover:bg-gray-50 transition-colors cursor-pointer",
        isExpanded && "bg-blue-50/50 border-b-blue-100"
      )}
      onClick={onToggleExpand}
    >
      {/* Checkbox column - placeholder for alignment */}
      <div className="w-8 flex-shrink-0 px-2" onClick={(e) => e.stopPropagation()}>
        {/* Checkbox removed for cleaner look - row click selects */}
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
        className="group relative px-2 flex-shrink-0 min-w-0" 
        style={{ width: columnWidths.name }}
        onClick={(e) => e.stopPropagation()}
      >
        <InlineEditableText
          value={item.name || 'Untitled Campaign'}
          onSave={handleNameSave}
          className="text-[13px]"
        />
        {/* Open button on hover */}
        <button
          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-[11px] text-blue-600 hover:underline transition-opacity"
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
            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium truncate max-w-full"
            style={{ 
              backgroundColor: `${brandColor}15`,
              color: brandColor,
              border: `1px solid ${brandColor}30`
            }}
          >
            {brandName}
          </span>
        ) : '—'}
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
    </div>
  );
}
