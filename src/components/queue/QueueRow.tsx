import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { TableCell, TableRow } from '@/components/ui/table';
import { StatusBadge } from './StatusBadge';
import { LinksTooltip } from './LinksTooltip';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { ExternalLink, Send, Eye } from 'lucide-react';

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

  const handleActionClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // Handle action
  };

  return (
    <TableRow 
      className="cursor-pointer hover:bg-muted/50"
      onClick={onClick}
    >
      <TableCell onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={selected}
          onCheckedChange={onSelect}
          aria-label={`Select ${item.name || 'campaign'}`}
        />
      </TableCell>
      
      <TableCell>
        <StatusBadge 
          status={item.status} 
          processingStep={item.processing_step}
          processingPercent={item.processing_percent}
          qaFlags={qaFlagsArray}
        />
      </TableCell>
      
      <TableCell>
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
      
      <TableCell>
        <div>
          <p className="font-medium truncate max-w-[200px]">
            {item.name || 'Untitled Campaign'}
          </p>
          <p className="text-xs text-muted-foreground">
            {item.source === 'figma' && 'From Figma'}
            {item.source === 'upload' && 'Uploaded'}
            {item.source === 'clickup' && 'From ClickUp'}
          </p>
        </div>
      </TableCell>
      
      <TableCell>
        {item.status === 'processing' ? (
          <span className="text-sm text-muted-foreground">Generating...</span>
        ) : item.selected_subject_line ? (
          <p className="text-sm truncate max-w-[250px]">
            "{item.selected_subject_line}"
          </p>
        ) : item.generated_subject_lines?.length ? (
          <Button variant="ghost" size="sm" className="h-auto py-1 px-2 text-muted-foreground">
            Select subject line →
          </Button>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </TableCell>
      
      <TableCell>
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
          <Button size="sm" variant="outline" onClick={handleActionClick}>
            <Eye className="h-3 w-3 mr-1" />
            Review
          </Button>
        )}
        {item.status === 'approved' && (
          <Button size="sm" onClick={handleActionClick}>
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
          <Button size="sm" variant="destructive" onClick={handleActionClick}>
            Retry
          </Button>
        )}
      </TableCell>
    </TableRow>
  );
}
