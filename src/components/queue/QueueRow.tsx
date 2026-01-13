import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from './StatusBadge';
import { LinksTooltip } from './LinksTooltip';
import { InlineEditableText } from './InlineEditableText';
import { InlineDropdownSelector } from './InlineDropdownSelector';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { ChevronDown, ChevronUp, ExternalLink, RotateCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ColumnWidths {
  status: number;
  preview: number;
  name: number;
  subject: number;
  previewText: number;
  links: number;
  actions: number;
}

interface QueueRowProps {
  item: CampaignQueueItem;
  selected: boolean;
  isExpanded: boolean;
  onSelect: (checked: boolean) => void;
  onToggleExpand: () => void;
  columnWidths: ColumnWidths;
}

export function QueueRow({ item, selected, isExpanded, onSelect, onToggleExpand, columnWidths }: QueueRowProps) {
  const slices = (item.slices as Array<{ link?: string }>) || [];
  const linkCount = slices.filter(s => s.link).length;
  const missingLinks = slices.filter(s => !s.link).length;

  // Convert qa_flags object to array for display
  const qaFlagsArray = item.qa_flags && typeof item.qa_flags === 'object' && !Array.isArray(item.qa_flags)
    ? Object.entries(item.qa_flags as Record<string, unknown>)
        .filter(([_, value]) => Boolean(value))
        .map(([key]) => ({ type: key }))
    : null;

  // Get brand name from joined data
  const brandName = (item as any).brands?.name;

  const handleNameSave = async (newName: string) => {
    const { error } = await supabase
      .from('campaign_queue')
      .update({ name: newName })
      .eq('id', item.id);

    if (error) {
      toast.error('Failed to update name');
      return false;
    }
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
    return true;
  };

  const handleRetryClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    const { error: updateError } = await supabase
      .from('campaign_queue')
      .update({
        status: 'processing',
        processing_step: 'retrying',
        processing_percent: 0,
        error_message: null,
        retry_count: (item.retry_count || 0) + 1
      })
      .eq('id', item.id);

    if (updateError) {
      toast.error('Failed to start retry');
      return;
    }

    supabase.functions.invoke('process-campaign-queue', {
      body: { campaignQueueId: item.id }
    });

    toast.success('Retrying...');
  };

  return (
    <div 
      className={cn(
        "flex items-center transition-colors cursor-pointer border-b last:border-b-0",
        "hover:bg-muted/40",
        isExpanded && "bg-muted/30 border-b-0"
      )}
      onClick={onToggleExpand}
    >
      {/* Checkbox */}
      <div className="w-8 flex-shrink-0 px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={`Select ${item.name || 'campaign'}`}
        />
      </div>
      
      {/* Status */}
      <div 
        className="px-2 py-1.5 flex-shrink-0" 
        style={{ width: columnWidths.status }}
        onClick={(e) => e.stopPropagation()}
      >
        <StatusBadge 
          status={item.status} 
          processingStep={item.processing_step}
          processingPercent={item.processing_percent}
          qaFlags={qaFlagsArray}
        />
      </div>
      
      {/* Preview Thumbnail */}
      <div className="px-2 py-1 flex-shrink-0" style={{ width: columnWidths.preview }}>
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name || 'Campaign preview'}
            className="h-10 w-7 object-cover object-top rounded border"
          />
        ) : (
          <div className="h-10 w-7 bg-muted rounded border flex items-center justify-center">
            <span className="text-[10px] text-muted-foreground">—</span>
          </div>
        )}
      </div>
      
      {/* Name */}
      <div 
        className="px-2 py-1.5 flex-shrink-0 min-w-0" 
        style={{ width: columnWidths.name }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="truncate">
          <InlineEditableText
            value={item.name || 'Untitled Campaign'}
            onSave={handleNameSave}
          />
          <div className="flex items-center gap-1 mt-0.5">
            {brandName && (
              <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 font-normal">
                {brandName}
              </Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              {item.source === 'figma' && 'Figma'}
              {item.source === 'upload' && 'Upload'}
              {item.source === 'clickup' && 'ClickUp'}
            </span>
          </div>
        </div>
      </div>
      
      {/* Subject Line */}
      <div 
        className="flex-1 min-w-0 px-2 py-1.5" 
        style={{ minWidth: columnWidths.subject }}
        onClick={(e) => e.stopPropagation()}
      >
        <InlineDropdownSelector
          selected={item.selected_subject_line}
          options={item.generated_subject_lines}
          provided={item.provided_subject_line}
          onSelect={handleSubjectLineSelect}
          placeholder="Select subject..."
          maxWidth="100%"
          isProcessing={item.status === 'processing'}
        />
      </div>

      {/* Preview Text */}
      <div 
        className="flex-1 min-w-0 px-2 py-1.5" 
        style={{ minWidth: columnWidths.previewText }}
        onClick={(e) => e.stopPropagation()}
      >
        <InlineDropdownSelector
          selected={item.selected_preview_text}
          options={item.generated_preview_texts}
          provided={item.provided_preview_text}
          onSelect={handlePreviewTextSelect}
          placeholder="Select preview..."
          maxWidth="100%"
          isProcessing={item.status === 'processing'}
        />
      </div>
      
      {/* Links */}
      <div 
        className="px-2 py-1.5 flex-shrink-0" 
        style={{ width: columnWidths.links }}
        onClick={(e) => e.stopPropagation()}
      >
        <LinksTooltip
          slices={slices}
          linkCount={linkCount}
          missingLinks={missingLinks}
        />
      </div>
      
      {/* Actions */}
      <div 
        className="px-2 py-1.5 flex-shrink-0" 
        style={{ width: columnWidths.actions }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-0.5">
          {item.status === 'failed' && (
            <Button size="sm" variant="ghost" onClick={handleRetryClick} className="h-6 w-6 p-0">
              <RotateCw className="h-3 w-3" />
            </Button>
          )}
          
          {item.klaviyo_campaign_url && (
            <Button 
              size="sm" 
              variant="ghost" 
              className="h-6 w-6 p-0"
              onClick={(e) => {
                e.stopPropagation();
                window.open(item.klaviyo_campaign_url!, '_blank');
              }}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          )}

          <Button 
            size="sm" 
            variant="ghost" 
            className="h-6 w-6 p-0"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand();
            }}
          >
            {isExpanded ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
