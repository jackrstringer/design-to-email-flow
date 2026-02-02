import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, Loader2, Eye, EyeOff, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { SliceEditorGrid } from '@/components/footer/SliceEditorGrid';
import { LegalSectionEditor } from '@/components/footer/LegalSectionEditor';
import { HtmlPreviewFrame } from '@/components/HtmlPreviewFrame';
import { generateImageFooterHtml } from '@/types/footer';
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
  const [zoom, setZoom] = useState(100);
  const [showReference, setShowReference] = useState(true);
  const [footerName, setFooterName] = useState('');

  // Fetch job and brand data on mount
  useEffect(() => {
    const fetchData = async () => {
      if (!brandId || !jobId) {
        setError('Missing brand or job ID');
        setIsLoading(false);
        return;
      }

      try {
        // Fetch job and brand in parallel
        const [jobResult, brandResult] = await Promise.all([
          supabase
            .from('footer_processing_jobs')
            .select('*')
            .eq('id', jobId)
            .single(),
          supabase
            .from('brands')
            .select('*')
            .eq('id', brandId)
            .single()
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
      } catch (err) {
        console.error('[ImageFooterStudio] Fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [brandId, jobId]);

  // Update a slice's properties
  const handleSliceUpdate = useCallback((index: number, updates: Partial<ImageFooterSlice>) => {
    setSlices(prev => prev.map((slice, i) => 
      i === index ? { ...slice, ...updates } : slice
    ));
  }, []);

  // Update legal section properties
  const handleLegalUpdate = useCallback((updates: Partial<LegalSectionData>) => {
    setLegalSection(prev => prev ? { ...prev, ...updates } : null);
  }, []);

  // Generate live HTML preview
  const previewHtml = useMemo(() => {
    if (slices.length === 0) return '';
    return generateImageFooterHtml(slices, legalSection, 600);
  }, [slices, legalSection]);

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
            is_primary: true, // New footers are primary by default
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

        <div className="flex items-center gap-3">
          {/* Zoom controls */}
          <div className="flex items-center gap-1 border rounded-md">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setZoom(z => Math.max(50, z - 25))}
              disabled={zoom <= 50}
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
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Reference image */}
        <div className="w-1/2 border-r bg-background p-4 overflow-auto">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-sm">Reference Image</h2>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowReference(!showReference)}
            >
              {showReference ? (
                <><EyeOff className="w-4 h-4 mr-1" /> Hide</>
              ) : (
                <><Eye className="w-4 h-4 mr-1" /> Show</>
              )}
            </Button>
          </div>

          {showReference && job.image_url && (
            <div 
              className="flex justify-center"
              style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
            >
              <img
                src={job.image_url}
                alt="Original footer reference"
                className="max-w-[600px] border rounded-lg shadow-sm"
              />
            </div>
          )}
        </div>

        {/* Right panel - Live preview */}
        <div className="w-1/2 bg-muted/50 p-4 overflow-auto">
          <h2 className="font-medium text-sm mb-4">Live Preview (HTML Output)</h2>
          
          <div 
            className="flex justify-center"
            style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top center' }}
          >
            <div className="bg-white rounded-lg shadow-sm overflow-hidden" style={{ width: '600px' }}>
              <HtmlPreviewFrame html={previewHtml} className="w-full" />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom panel - Editors */}
      <div className="bg-background border-t">
        {/* Slice Editor */}
        <div className="p-4 border-b">
          <h3 className="font-medium text-sm mb-3">Image Slices ({slices.length})</h3>
          <SliceEditorGrid
            slices={slices}
            brandId={brand.id}
            onSliceUpdate={handleSliceUpdate}
          />
        </div>

        {/* Legal Section Editor */}
        {legalSection && (
          <div className="p-4">
            <h3 className="font-medium text-sm mb-3">Legal Section</h3>
            <LegalSectionEditor
              legalSection={legalSection}
              onUpdate={handleLegalUpdate}
            />
          </div>
        )}
      </div>
    </div>
  );
}
