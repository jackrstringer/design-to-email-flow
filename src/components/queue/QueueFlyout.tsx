import { useState } from 'react';
import { X, ExternalLink, Trash2, RefreshCw, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { StatusBadge } from './StatusBadge';
import { SubjectLineSelector } from './SubjectLineSelector';
import { CampaignQueueItem } from '@/hooks/useCampaignQueue';
import { formatDistanceToNow } from 'date-fns';

interface QueueFlyoutProps {
  item: CampaignQueueItem | null;
  onClose: () => void;
  onUpdate: () => void;
}

export function QueueFlyout({ item, onClose, onUpdate }: QueueFlyoutProps) {
  if (!item) return null;

  const slices = (item.slices as Array<{ link?: string; altText?: string }>) || [];

  return (
    <Sheet open={!!item} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div>
              <SheetTitle className="text-lg">
                {item.name || 'Untitled Campaign'}
              </SheetTitle>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                {item.source === 'figma' && item.source_url && (
                  <a 
                    href={item.source_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 hover:text-foreground"
                  >
                    Source: Figma <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                {item.source === 'upload' && 'Uploaded'}
                <span>•</span>
                <span>Created {formatDistanceToNow(new Date(item.created_at))} ago</span>
              </div>
            </div>
            <StatusBadge 
              status={item.status}
              processingStep={item.processing_step}
              processingPercent={item.processing_percent}
              qaFlags={item.qa_flags as unknown[] | null}
            />
          </div>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-6">
          {/* Left Column - Preview */}
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium mb-2">Campaign Preview</h3>
              {item.image_url ? (
                <div className="border rounded-lg overflow-hidden">
                  <img
                    src={item.image_url}
                    alt={item.name || 'Campaign preview'}
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="border rounded-lg h-64 flex items-center justify-center bg-muted">
                  <span className="text-muted-foreground">No preview available</span>
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-medium mb-2">Slices</h3>
              <div className="space-y-1 text-sm">
                {slices.length > 0 ? (
                  slices.map((slice, index) => (
                    <div 
                      key={index}
                      className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/50"
                    >
                      <span className="text-muted-foreground">
                        {index + 1}. {slice.altText || `Slice ${index + 1}`}
                      </span>
                      <span className="text-xs truncate max-w-[120px]">
                        {slice.link || '—'}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground">No slices defined</p>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Details */}
          <div className="space-y-6">
            <SubjectLineSelector
              label="Subject Line"
              selected={item.selected_subject_line}
              provided={item.provided_subject_line}
              generated={item.generated_subject_lines}
              onSelect={(value) => {
                // Update subject line
                console.log('Select subject line:', value);
              }}
            />

            <SubjectLineSelector
              label="Preview Text"
              selected={item.selected_preview_text}
              provided={item.provided_preview_text}
              generated={item.generated_preview_texts}
              onSelect={(value) => {
                // Update preview text
                console.log('Select preview text:', value);
              }}
            />

            <Separator />

            <div>
              <h3 className="text-sm font-medium mb-2">QA Check</h3>
              <div className="space-y-1 text-sm">
                {!item.spelling_errors?.length && !item.qa_flags?.length ? (
                  <>
                    <p className="text-green-600">✓ No spelling errors</p>
                    <p className="text-green-600">✓ All links verified</p>
                    <p className="text-green-600">✓ Alt text complete</p>
                  </>
                ) : (
                  <>
                    {(item.qa_flags as Array<{ message: string }>)?.map((flag, i) => (
                      <p key={i} className="text-yellow-600">⚠️ {flag.message}</p>
                    ))}
                  </>
                )}
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-sm font-medium mb-2">Links</h3>
              <div className="space-y-1">
                {slices.map((slice, index) => (
                  <div 
                    key={index}
                    className="flex items-center justify-between text-sm py-1"
                  >
                    <span className="text-muted-foreground">Slice {index + 1}:</span>
                    {slice.link ? (
                      <span className="truncate max-w-[180px]">{slice.link}</span>
                    ) : (
                      <span className="text-muted-foreground">— not clickable</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <Separator className="my-6" />

        {/* Footer Actions */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Campaign
          </Button>

          <div className="flex gap-2">
            <Button variant="outline" size="sm">
              <RefreshCw className="h-4 w-4 mr-1" />
              Reprocess
            </Button>
            <Button size="sm" disabled={item.status === 'processing'}>
              <Send className="h-4 w-4 mr-1" />
              Send to Klaviyo
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
