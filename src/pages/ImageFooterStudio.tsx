import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, ZoomIn, ZoomOut, Link, X, Plus, AlertTriangle, FileText, Columns } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { InlineLegalEditor } from '@/components/footer/InlineLegalEditor';
import { HtmlPreviewFrame } from '@/components/HtmlPreviewFrame';
import { generateImageFooterHtml } from '@/types/footer';
import { cn } from '@/lib/utils';
import type { ImageFooterSlice, LegalSectionData, StoredImageFooterData } from '@/types/footer';
import type { Brand } from '@/types/brand-assets';

interface FooterJob {
  id: string;
  brand_id: string;
  image_url: string;
  image_width: number | null;
  image_height: number | null;
  slices: ImageFooterSlice[] | null;
  legal_section: LegalSectionData | null;
  legal_cutoff_y: number | null;
  status: string;
}

// Base width for email content
const BASE_WIDTH = 600;

export default function ImageFooterStudio() {
  const { brandId, jobId } = useParams<{ brandId: string; jobId: string }>();
  const navigate = useNavigate();

  // Data state
  const [job, setJob] = useState<FooterJob | null>(null);
  const [brand, setBrand] = useState<Brand | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Editable state
  const [slices, setSlices] = useState<ImageFooterSlice[]>([]);
  const [legalSection, setLegalSection] = useState<LegalSectionData | null>(null);

  // UI state
  const [isSaving, setIsSaving] = useState(false);
  const [zoom, setZoom] = useState(50);
  const [viewMode, setViewMode] = useState<'render' | 'original'>('render');
  const [footerName, setFooterName] = useState('');
  
  // Editing state (CampaignStudio style)
  const [editingLinkIndex, setEditingLinkIndex] = useState<number | null>(null);
  const [editingAltIndex, setEditingAltIndex] = useState<number | null>(null);
  const [linkSearchValue, setLinkSearchValue] = useState('');
  const [brandLinks, setBrandLinks] = useState<string[]>([]);

  const scaledWidth = useMemo(() => BASE_WIDTH * (zoom / 100), [zoom]);

  // Fetch job and brand data on mount
  useEffect(() => {
    const fetchData = async () => {
      if (!brandId || !jobId) {
        setError('Missing brand or job ID');
        setIsLoading(false);
        return;
      }

      try {
        // Fetch job, brand, and links in parallel
        const [jobResult, brandResult, linksResult] = await Promise.all([
          supabase
            .from('footer_processing_jobs')
            .select('*')
            .eq('id', jobId)
            .single(),
          supabase
            .from('brands')
            .select('*')
            .eq('id', brandId)
            .single(),
          supabase
            .from('brand_link_index')
            .select('url')
            .eq('brand_id', brandId)
            .eq('is_healthy', true)
            .order('use_count', { ascending: false })
            .limit(50)
        ]);

        if (jobResult.error) throw new Error(jobResult.error.message);
        if (brandResult.error) throw new Error(brandResult.error.message);

        const fetchedJob = jobResult.data as unknown as FooterJob;
        setJob(fetchedJob);
        setBrand(brandResult.data as unknown as Brand);

        // Initialize editable state from job
        setSlices(fetchedJob.slices || []);
        setLegalSection(fetchedJob.legal_section || null);
        setFooterName(`${brandResult.data.name} Footer`);
        
        // Set brand links for autocomplete
        if (linksResult.data) {
          setBrandLinks(linksResult.data.map(l => l.url));
        }
      } catch (err) {
        console.error('[ImageFooterStudio] Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [brandId, jobId]);

  // Filter links based on search
  const filteredLinks = brandLinks.filter(link => 
    link.toLowerCase().includes(linkSearchValue.toLowerCase())
  );

  // Update a slice's properties
  const updateSlice = useCallback((index: number, updates: Partial<ImageFooterSlice>) => {
    setSlices(prev => prev.map((slice, i) => 
      i === index ? { ...slice, ...updates } : slice
    ));
  }, []);

  // Set slice link
  const setSliceLink = (index: number, link: string) => {
    updateSlice(index, { link, linkSource: 'manual' });
    setEditingLinkIndex(null);
    setLinkSearchValue('');
  };

  // Remove link from slice
  const removeLink = (index: number) => {
    updateSlice(index, { link: null });
  };

  // Update legal section properties
  const handleLegalUpdate = useCallback((updates: Partial<LegalSectionData>) => {
    setLegalSection(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  // Add default legal section - default to white bg / dark text which is most common
  const handleAddLegalSection = () => {
    setLegalSection({
      yStart: slices.length > 0 ? Math.max(...slices.map(s => s.yBottom)) : 0,
      backgroundColor: '#ffffff',
      textColor: '#1a1a1a',
      detectedElements: []
    });
  };

  // Generate live HTML preview
  const previewHtml = useMemo(() => {
    if (slices.length === 0) return '';
    return generateImageFooterHtml(slices, legalSection, 600);
  }, [slices, legalSection]);

  // Group slices by rowIndex for rendering
  const groupedSlices = useMemo(() => {
    const groups = new Map<number, { slice: ImageFooterSlice; originalIndex: number }[]>();
    
    slices.forEach((slice, index) => {
      const rowIndex = slice.rowIndex ?? index;
      if (!groups.has(rowIndex)) {
        groups.set(rowIndex, []);
      }
      groups.get(rowIndex)!.push({ slice, originalIndex: index });
    });
    
    return Array.from(groups.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([_, slicesInRow]) => slicesInRow.sort((a, b) => (a.slice.column ?? 0) - (b.slice.column ?? 0)));
  }, [slices]);

  // Save footer to brand_footers
  const handleSave = async () => {
    if (!brand || !job) return;

    setIsSaving(true);
    try {
      // Build stored data
      const imageSlicesData: StoredImageFooterData = {
        slices,
        legalSection,
        originalImageUrl: job.image_url,
        generatedAt: new Date().toISOString(),
        jobId: job.id,
      };

      // Generate final HTML
      const finalHtml = generateImageFooterHtml(slices, legalSection, 600);

      // Check if a footer with this name exists
      const { data: existing } = await supabase
        .from('brand_footers')
        .select('id')
        .eq('brand_id', brand.id)
        .eq('name', footerName)
        .single();

      if (existing) {
        // Update existing footer
        const { error: updateError } = await supabase
          .from('brand_footers')
          .update({
            html: finalHtml,
            image_slices: JSON.parse(JSON.stringify(imageSlicesData)),
            footer_type: 'image',
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);

        if (updateError) throw updateError;
      } else {
        // Create new footer
        const { error: insertError } = await supabase
          .from('brand_footers')
          .insert([{
            brand_id: brand.id,
            name: footerName,
            html: finalHtml,
            image_slices: JSON.parse(JSON.stringify(imageSlicesData)),
            footer_type: 'image',
            is_primary: true,
          }]);

        if (insertError) throw insertError;
      }

      // Mark job as completed
      await supabase
        .from('footer_processing_jobs')
        .update({ status: 'completed' })
        .eq('id', job.id);

      toast.success('Footer saved successfully!');
      navigate(`/brands/${brand.id}/email`);
    } catch (err) {
      console.error('[ImageFooterStudio] Save error:', err);
      toast.error('Failed to save footer');
    } finally {
      setIsSaving(false);
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <Loader2 className="w-10 h-10 mx-auto animate-spin text-primary" />
          <p className="text-muted-foreground">Loading footer studio...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error || !job || !brand) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <p className="text-destructive">{error || 'Failed to load footer data'}</p>
          <Button variant="outline" onClick={() => navigate(-1)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Header */}
      <header className="bg-background border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/brands/${brand.id}/email`)}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="font-semibold">Image Footer Studio</h1>
            <p className="text-sm text-muted-foreground">{brand.name}</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* View Toggle */}
          <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
            <button 
              onClick={() => setViewMode('render')}
              className={cn(
                "px-3 py-1.5 rounded text-sm transition-colors",
                viewMode === 'render' ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Render
            </button>
            <button 
              onClick={() => setViewMode('original')}
              className={cn(
                "px-3 py-1.5 rounded text-sm transition-colors",
                viewMode === 'original' ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              Original
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 border rounded-md">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom(z => Math.max(25, z - 25))}
              disabled={zoom <= 25}
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm w-12 text-center">{zoom}%</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom(z => Math.min(150, z + 25))}
              disabled={zoom >= 150}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
          </div>

          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Footer
          </Button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-[1200px] mx-auto">
          
          {/* Original Image View */}
          {viewMode === 'original' && job.image_url && (
            <div className="flex justify-center mb-6">
              <img
                src={job.image_url}
                alt="Original footer"
                style={{ width: scaledWidth }}
                className="border rounded-lg shadow-sm"
              />
            </div>
          )}

          {/* Render View - Queue-style stacked slices */}
          {viewMode === 'render' && (
            <div className="flex flex-col items-center">
              {/* No slices message */}
              {slices.length === 0 && (
                <div className="flex items-center justify-center h-40 text-muted-foreground">
                  <div className="text-center">
                    <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                    <p className="text-sm">No slices available</p>
                  </div>
                </div>
              )}

              {/* Render each slice group (row) */}
              {groupedSlices.map((slicesInRow, groupIndex) => {
                const isMultiColumnRow = slicesInRow.length > 1 || (slicesInRow[0]?.slice.totalColumns ?? 1) > 1;
                const columnCount = slicesInRow[0]?.slice.totalColumns || slicesInRow.length;
                
                return (
                  <div 
                    key={groupIndex} 
                    className={cn(
                      "relative flex justify-center items-stretch group/row w-full",
                      isMultiColumnRow ? "border-l-4 border-blue-400 bg-blue-50/30 hover:bg-blue-50/50" : "hover:bg-muted/10"
                    )}
                  >
                    {/* Multi-column indicator badge */}
                    {isMultiColumnRow && (
                      <div className="absolute -top-2 left-2 z-20 flex items-center gap-1 bg-blue-500 text-white text-[10px] font-medium px-2 py-0.5 rounded-full shadow-sm">
                        <Columns className="w-3 h-3" />
                        {columnCount}-Column Block
                      </div>
                    )}
                    
                    {/* Slice separator line */}
                    {groupIndex > 0 && (
                      <div className="absolute top-0 left-0 right-0 flex items-center z-10" style={{ transform: 'translateY(-50%)' }}>
                        <div className={cn("h-px flex-1", isMultiColumnRow ? "bg-blue-300" : "bg-border")} />
                      </div>
                    )}
                    
                    {/* Left: Link Column */}
                    <div className="flex flex-col justify-center py-1 pr-3 gap-1 items-end flex-shrink-0 w-[280px]">
                      {slicesInRow.map(({ slice, originalIndex }, colIdx) => (
                        <Popover 
                          key={originalIndex} 
                          open={editingLinkIndex === originalIndex} 
                          onOpenChange={(open) => {
                            if (open) {
                              setEditingLinkIndex(originalIndex);
                              setLinkSearchValue('');
                            } else {
                              setEditingLinkIndex(null);
                            }
                          }}
                        >
                          <PopoverTrigger asChild>
                            {slice.link ? (
                              <button className={cn(
                                "flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] transition-colors text-left max-w-full overflow-hidden",
                                isMultiColumnRow 
                                  ? "bg-blue-50 border border-blue-200 hover:bg-blue-100" 
                                  : "bg-muted/50 border border-border/50 hover:bg-muted"
                              )}>
                                {isMultiColumnRow && (
                                  <span className="bg-blue-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0">
                                    {colIdx + 1}
                                  </span>
                                )}
                                <Link className={cn("w-3 h-3 flex-shrink-0", isMultiColumnRow ? "text-blue-500" : "text-muted-foreground")} />
                                <span className="text-muted-foreground truncate">{slice.link}</span>
                              </button>
                            ) : (
                              <button className={cn(
                                "flex items-center gap-1.5 px-2 py-0.5 border border-dashed rounded transition-colors text-[9px] whitespace-nowrap",
                                isMultiColumnRow 
                                  ? "border-blue-300 text-blue-500 hover:border-blue-500" 
                                  : "border-muted-foreground/30 text-muted-foreground/50 hover:border-primary/40 opacity-0 group-hover/row:opacity-100"
                              )}>
                                {isMultiColumnRow && (
                                  <span className="bg-blue-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0">
                                    {colIdx + 1}
                                  </span>
                                )}
                                <Plus className="w-3 h-3 flex-shrink-0" />
                                <span>{isMultiColumnRow ? `Col ${colIdx + 1}` : 'Add link'}</span>
                              </button>
                            )}
                          </PopoverTrigger>
                          <PopoverContent className="w-96 p-0" align="end" side="left">
                            <Command>
                              <CommandInput 
                                placeholder="Search or enter URL..." 
                                value={linkSearchValue}
                                onValueChange={setLinkSearchValue}
                              />
                              <CommandList>
                                <CommandEmpty>
                                  {linkSearchValue && (
                                    <button
                                      className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                                      onClick={() => setSliceLink(originalIndex, linkSearchValue)}
                                    >
                                      Use "{linkSearchValue}"
                                    </button>
                                  )}
                                </CommandEmpty>
                                {filteredLinks.length > 0 && (
                                  <CommandGroup heading="Brand Links">
                                    {filteredLinks.slice(0, 10).map((link) => (
                                      <CommandItem
                                        key={link}
                                        value={link}
                                        onSelect={() => setSliceLink(originalIndex, link)}
                                        className="text-xs"
                                      >
                                        <span className="break-all">{link}</span>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                )}
                                {slice.link && (
                                  <CommandGroup>
                                    <CommandItem
                                      onSelect={() => {
                                        removeLink(originalIndex);
                                        setEditingLinkIndex(null);
                                      }}
                                      className="text-xs text-destructive"
                                    >
                                      <X className="w-3 h-3 mr-2" />
                                      Remove link
                                    </CommandItem>
                                  </CommandGroup>
                                )}
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      ))}
                    </div>
                    
                    {/* Center: Image Column */}
                    <div className="flex flex-shrink-0" style={{ width: scaledWidth }}>
                      {slicesInRow.map(({ slice, originalIndex }, colIdx) => {
                        const colWidth = slice.totalColumns 
                          ? scaledWidth / slice.totalColumns 
                          : scaledWidth / slicesInRow.length;
                        
                        return (
                          <div 
                            key={originalIndex} 
                            className={cn(
                              "relative",
                              isMultiColumnRow && colIdx > 0 && "border-l-2 border-blue-300"
                            )}
                            style={{ width: colWidth }}
                          >
                            {/* Column number badge on image */}
                            {isMultiColumnRow && (
                              <div className="absolute top-2 right-2 bg-blue-500 text-white text-xs w-6 h-6 rounded-full flex items-center justify-center font-semibold z-10 shadow-md">
                                {colIdx + 1}
                              </div>
                            )}
                            
                            {slice.imageUrl ? (
                              <img
                                src={slice.imageUrl}
                                alt={slice.altText || `Slice ${originalIndex + 1}`}
                                style={{ width: '100%' }}
                                className="block"
                              />
                            ) : (
                              <div 
                                className="bg-muted flex items-center justify-center text-muted-foreground text-xs"
                                style={{ width: '100%', height: 60 }}
                              >
                                No image
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    
                    {/* Right: Alt Text Column */}
                    <div className="flex flex-col justify-center py-1 pl-3 gap-1 flex-shrink-0 w-[280px]">
                      {slicesInRow.map(({ slice, originalIndex }, colIdx) => (
                        <div key={originalIndex} className={cn(isMultiColumnRow && "flex items-start gap-1.5")}>
                          {isMultiColumnRow && (
                            <span className="bg-blue-500 text-white text-[8px] w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                              {colIdx + 1}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            {editingAltIndex === originalIndex ? (
                              <textarea
                                value={slice.altText || ''}
                                onChange={(e) => updateSlice(originalIndex, { altText: e.target.value })}
                                placeholder="Alt text..."
                                onBlur={() => setEditingAltIndex(null)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    setEditingAltIndex(null);
                                  }
                                  if (e.key === 'Escape') {
                                    setEditingAltIndex(null);
                                  }
                                }}
                                autoFocus
                                className="w-full text-[10px] p-1 rounded border border-primary resize-none min-h-[40px] bg-background"
                              />
                            ) : (
                              <button
                                onClick={() => setEditingAltIndex(originalIndex)}
                                className={cn(
                                  "text-[10px] text-left w-full p-1 rounded transition-colors",
                                  slice.altText
                                    ? "text-muted-foreground hover:bg-muted"
                                    : "text-muted-foreground/50 italic hover:bg-muted opacity-0 group-hover/row:opacity-100"
                                )}
                              >
                                {slice.altText || 'Add alt text...'}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Legal Section - Inline Editable */}
              {legalSection && (
                <InlineLegalEditor
                  legalSection={legalSection}
                  onUpdate={handleLegalUpdate}
                  width={scaledWidth}
                />
              )}
              
              {/* Missing legal section warning */}
              {!legalSection && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4" style={{ width: scaledWidth }}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-amber-800">Legal Section Required</h4>
                      <p className="text-sm text-amber-700 mt-1">
                        Email footers must include organization name, address, and unsubscribe links.
                      </p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-3 border-amber-300 text-amber-800 hover:bg-amber-100"
                        onClick={handleAddLegalSection}
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Add Legal Section
                      </Button>
                    </div>
                  </div>
                </div>
              )}
              
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
