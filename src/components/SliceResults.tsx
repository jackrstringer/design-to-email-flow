import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Link, Unlink, ExternalLink, ChevronLeft, Rocket, FileText, Image, Code, Loader2, Pencil, CheckCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProcessedSlice } from '@/types/slice';
import { HtmlEditorModal } from './HtmlEditorModal';

interface SliceResultsProps {
  slices: ProcessedSlice[];
  onSlicesChange: (slices: ProcessedSlice[]) => void;
  onBack: () => void;
  onCreateTemplate: () => void;
  onCreateCampaign: () => void;
  onConvertToHtml: (index: number) => Promise<void>;
  isCreating: boolean;
  brandUrl?: string;
}

export function SliceResults({ 
  slices, 
  onSlicesChange, 
  onBack, 
  onCreateTemplate, 
  onCreateCampaign,
  onConvertToHtml,
  isCreating,
  brandUrl,
}: SliceResultsProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [convertingIndex, setConvertingIndex] = useState<number | null>(null);
  const [htmlEditorOpen, setHtmlEditorOpen] = useState(false);
  const [htmlEditorSliceIndex, setHtmlEditorSliceIndex] = useState<number | null>(null);

  const updateSlice = (index: number, updates: Partial<ProcessedSlice>) => {
    const updated = [...slices];
    updated[index] = { ...updated[index], ...updates };
    onSlicesChange(updated);
  };

  const toggleLink = (index: number) => {
    const slice = slices[index];
    if (slice.link) {
      updateSlice(index, { link: null, isClickable: false });
    } else {
      updateSlice(index, { link: '', isClickable: true });
      setEditingIndex(index);
    }
  };

  const toggleSliceType = async (index: number) => {
    const slice = slices[index];
    if (slice.type === 'image') {
      // Convert to HTML - trigger AI generation
      setConvertingIndex(index);
      try {
        await onConvertToHtml(index);
      } finally {
        setConvertingIndex(null);
      }
    } else {
      // Convert back to image
      updateSlice(index, { type: 'image', htmlContent: undefined });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">Review Slices</h3>
          <p className="text-sm text-muted-foreground">
            Edit alt text, links, and slice types before creating your template
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={onBack} disabled={isCreating}>
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>
      </div>

      {/* Slices list */}
      <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
        {slices.map((slice, index) => (
          <div 
            key={index}
            className={cn(
              'p-3 rounded-lg border bg-muted/30',
              slice.type === 'html' ? 'border-blue-500/50' : 'border-border'
            )}
          >
            <div className="flex gap-3">
              {/* Thumbnail */}
              <div className="w-20 h-20 flex-shrink-0 rounded overflow-hidden border border-border bg-background">
                <img 
                  src={slice.imageUrl} 
                  alt={slice.altText}
                  className="w-full h-full object-cover object-top"
                />
              </div>

              {/* Details */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Slice {index + 1}
                  </span>
                  
                  {/* Type toggle */}
                  <button
                    onClick={() => toggleSliceType(index)}
                    disabled={convertingIndex !== null || isCreating}
                    className={cn(
                      'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                      slice.type === 'html'
                        ? 'bg-blue-500/20 text-blue-600 hover:bg-blue-500/30'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    )}
                  >
                    {convertingIndex === index ? (
                      <><Loader2 className="w-3 h-3 animate-spin" /> Converting...</>
                    ) : slice.type === 'html' ? (
                      <><Code className="w-3 h-3" /> HTML</>
                    ) : (
                      <><Image className="w-3 h-3" /> Image</>
                    )}
                  </button>
                </div>

                {slice.type === 'image' ? (
                  <>
                    {/* Alt text */}
                    <Input
                      value={slice.altText}
                      onChange={(e) => updateSlice(index, { altText: e.target.value })}
                      placeholder="Alt text"
                      className="h-8 text-sm"
                    />

                    {/* Link */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => toggleLink(index)}
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors',
                          slice.link !== null
                            ? 'bg-primary/10 text-primary hover:bg-primary/20'
                            : 'bg-muted text-muted-foreground hover:bg-muted/80'
                        )}
                      >
                        {slice.link !== null ? (
                          <><Link className="w-3 h-3" /> Linked</>
                        ) : (
                          <><Unlink className="w-3 h-3" /> No link</>
                        )}
                      </button>

                      {slice.link !== null && (
                        <Input
                          value={slice.link}
                          onChange={(e) => updateSlice(index, { link: e.target.value })}
                          placeholder="https://..."
                          className="h-7 text-xs flex-1"
                          autoFocus={editingIndex === index}
                          onFocus={() => setEditingIndex(index)}
                          onBlur={() => setEditingIndex(null)}
                        />
                      )}

                      {slice.link && (
                        <>
                          {/* Link verification status */}
                          {slice.linkVerified ? (
                            <div className="flex items-center gap-1 text-green-500" title="Verified via web search">
                              <CheckCircle className="w-3.5 h-3.5" />
                            </div>
                          ) : slice.linkWarning ? (
                            <div className="flex items-center gap-1 text-amber-500" title={slice.linkWarning}>
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 text-amber-500" title="Unverified link">
                              <AlertTriangle className="w-3.5 h-3.5" />
                            </div>
                          )}
                          <a
                            href={slice.link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1 text-muted-foreground hover:text-foreground"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </>
                      )}
                    </div>
                    {/* Link warning message */}
                    {slice.link && slice.linkWarning && (
                      <div className="flex items-center gap-1 text-xs text-amber-500">
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        <span>{slice.linkWarning}</span>
                      </div>
                    )}
                  </>
                ) : (
                  /* HTML Content with Edit button */
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setHtmlEditorSliceIndex(index);
                          setHtmlEditorOpen(true);
                        }}
                        className="h-7 text-xs"
                      >
                        <Pencil className="w-3 h-3 mr-1" />
                        Edit in Studio
                      </Button>
                    </div>
                    <Textarea
                      value={slice.htmlContent || ''}
                      onChange={(e) => updateSlice(index, { htmlContent: e.target.value })}
                      placeholder="HTML content..."
                      className="text-xs font-mono min-h-[80px]"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <Button 
          variant="outline" 
          onClick={onCreateTemplate} 
          disabled={isCreating || convertingIndex !== null}
          className="flex-1"
        >
          <FileText className="w-4 h-4 mr-2" />
          Create Template
        </Button>
        <Button 
          onClick={onCreateCampaign} 
          disabled={isCreating || convertingIndex !== null}
          className="flex-1"
        >
          <Rocket className="w-4 h-4 mr-2" />
          {isCreating ? 'Creating...' : 'Create Campaign'}
        </Button>
      </div>

      {/* HTML Editor Modal */}
      {htmlEditorSliceIndex !== null && (
        <HtmlEditorModal
          open={htmlEditorOpen}
          onOpenChange={setHtmlEditorOpen}
          html={slices[htmlEditorSliceIndex]?.htmlContent || ''}
          originalImageUrl={slices[htmlEditorSliceIndex]?.imageUrl || ''}
          brandUrl={brandUrl}
          onSave={(html) => {
            updateSlice(htmlEditorSliceIndex, { htmlContent: html });
            setHtmlEditorSliceIndex(null);
          }}
        />
      )}
    </div>
  );
}
