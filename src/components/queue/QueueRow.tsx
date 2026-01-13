import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from './StatusBadge';
import { LinksTooltip } from './LinksTooltip';
import { InlineEditableText } from './InlineEditableText';
import { InlineDropdownSelector } from './InlineDropdownSelector';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { ExternalLink, Send, Eye } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface QueueRowProps {
  item: CampaignQueueItem;
  selected: boolean;
  onSelect: (checked: boolean) => void;
  onClick: () => void;
}

export function QueueRow({ item, selected, onSelect, onClick }: QueueRowProps) {
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

  const handleReviewClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onClick();
  };

  const handleSendClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // TODO: implement send to Klaviyo
    toast.info('Send to Klaviyo coming soon');
  };

  const handleRetryClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // TODO: implement retry
    toast.info('Retry coming soon');
  };

  return (
    <TableRow className="hover:bg-muted/50">
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={`Select ${item.name || 'campaign'}`}
        />
      </TableCell>
      
      <TableCell onClick={(e) => e.stopPropagation()}>
        <StatusBadge 
          status={item.status} 
          processingStep={item.processing_step}
          processingPercent={item.processing_percent}
          qaFlags={qaFlagsArray}
        />
      </TableCell>
      
      <TableCell 
        className="cursor-pointer"
        onClick={onClick}
      >
        {item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name || 'Campaign preview'}
            className="h-16 w-10 object-cover object-top rounded border"
          />
        ) : (
          <div className="h-16 w-10 bg-muted rounded border flex items-center justify-center">
            <span className="text-xs text-muted-foreground">—</span>
          </div>
        )}
      </TableCell>
      
      <TableCell onClick={(e) => e.stopPropagation()}>
        <div>
          <InlineEditableText
            value={item.name || 'Untitled Campaign'}
            onSave={handleNameSave}
          />
          <div className="flex items-center gap-1 mt-0.5">
            {brandName && (
              <Badge variant="outline" className="text-xs px-1 py-0 h-4">
                {brandName}
              </Badge>
            )}
            <span className="text-xs text-muted-foreground">
              {item.source === 'figma' && 'Figma'}
              {item.source === 'upload' && 'Uploaded'}
              {item.source === 'clickup' && 'ClickUp'}
            </span>
          </div>
        </div>
      </TableCell>
      
      <TableCell onClick={(e) => e.stopPropagation()}>
        <InlineDropdownSelector
          selected={item.selected_subject_line}
          options={item.generated_subject_lines}
          provided={item.provided_subject_line}
          onSelect={handleSubjectLineSelect}
          placeholder="Select subject line →"
          isProcessing={item.status === 'processing'}
        />
      </TableCell>
      
      <TableCell onClick={(e) => e.stopPropagation()}>
        <LinksTooltip
          slices={slices}
          linkCount={linkCount}
          missingLinks={missingLinks}
        />
      </TableCell>
      
      <TableCell onClick={(e) => e.stopPropagation()}>
        {item.status === 'processing' && (
          <span className="text-xs text-muted-foreground">···</span>
        )}
        {item.status === 'ready_for_review' && (
          <Button size="sm" variant="outline" onClick={handleReviewClick}>
            <Eye className="h-3 w-3 mr-1" />
            Review
          </Button>
        )}
        {item.status === 'approved' && (
          <Button size="sm" onClick={handleSendClick}>
            <Send className="h-3 w-3 mr-1" />
            Send
          </Button>
        )}
        {item.status === 'sent_to_klaviyo' && item.klaviyo_campaign_url && (
          <Button size="sm" variant="ghost" asChild>
            <a href={item.klaviyo_campaign_url} target="_blank" rel="noopener noreferrer">
              View <ExternalLink className="h-3 w-3 ml-1" />
            </a>
          </Button>
        )}
        {item.status === 'failed' && (
          <Button size="sm" variant="destructive" onClick={handleRetryClick}>
            Retry
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
