import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { ImageFooterSlice, LegalSectionData } from '@/types/footer';

export interface FooterProcessingJob {
  id: string;
  user_id: string;
  brand_id: string;
  source: 'upload' | 'figma';
  source_url: string | null;
  image_url: string;
  cloudinary_public_id: string | null;
  image_width: number | null;
  image_height: number | null;
  slices: ImageFooterSlice[] | null;
  legal_section: LegalSectionData | null;
  legal_cutoff_y: number | null;
  status: 'processing' | 'pending_review' | 'completed' | 'failed';
  processing_step: string | null;
  processing_percent: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  processing_completed_at: string | null;
}

interface UseFooterProcessingJobOptions {
  onComplete?: (job: FooterProcessingJob) => void;
  onError?: (error: string) => void;
}

export function useFooterProcessingJob(options: UseFooterProcessingJobOptions = {}) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<FooterProcessingJob | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Store callbacks in refs to avoid re-subscribing on every render
  const onCompleteRef = useRef(options.onComplete);
  const onErrorRef = useRef(options.onError);
  
  // Keep refs updated with latest callbacks
  useEffect(() => {
    onCompleteRef.current = options.onComplete;
    onErrorRef.current = options.onError;
  }, [options.onComplete, options.onError]);

  // Subscribe to realtime updates for the job
  useEffect(() => {
    if (!jobId) return;

    console.log('[useFooterProcessingJob] Subscribing to job:', jobId);

    const channel = supabase
      .channel(`footer-job-${jobId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'footer_processing_jobs',
          filter: `id=eq.${jobId}`
        },
        (payload) => {
          console.log('[useFooterProcessingJob] Job updated:', payload.new);
          const updatedJob = payload.new as FooterProcessingJob;
          setJob(updatedJob);

          if (updatedJob.status === 'pending_review' || updatedJob.status === 'completed') {
            onCompleteRef.current?.(updatedJob);
          } else if (updatedJob.status === 'failed') {
            const errorMsg = updatedJob.error_message || 'Processing failed';
            setError(errorMsg);
            onErrorRef.current?.(errorMsg);
          }
        }
      )
      .subscribe((status) => {
        console.log('[useFooterProcessingJob] Subscription status:', status);
      });

    return () => {
      console.log('[useFooterProcessingJob] Unsubscribing from job:', jobId);
      supabase.removeChannel(channel);
    };
  }, [jobId]); // Only re-subscribe when jobId changes, not callbacks

  // Create a new processing job
  const createJob = useCallback(async (params: {
    brandId: string;
    source: 'upload' | 'figma';
    sourceUrl?: string;
    imageUrl: string;
    cloudinaryPublicId?: string;
    imageWidth: number;
    imageHeight: number;
  }): Promise<string | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User not authenticated');
      }

      // Create the job record
      const { data: newJob, error: insertError } = await supabase
        .from('footer_processing_jobs')
        .insert({
          user_id: user.id,
          brand_id: params.brandId,
          source: params.source,
          source_url: params.sourceUrl || null,
          image_url: params.imageUrl,
          cloudinary_public_id: params.cloudinaryPublicId || null,
          image_width: params.imageWidth,
          image_height: params.imageHeight,
          status: 'processing',
          processing_step: 'queued',
          processing_percent: 0,
        })
        .select()
        .single();

      if (insertError || !newJob) {
        throw new Error(insertError?.message || 'Failed to create job');
      }

      console.log('[useFooterProcessingJob] Created job:', newJob.id);
      setJobId(newJob.id);
      setJob(newJob as unknown as FooterProcessingJob);

      // Trigger the processing edge function
      const { error: invokeError } = await supabase.functions.invoke('process-footer-queue', {
        body: { jobId: newJob.id }
      });

      if (invokeError) {
        console.error('[useFooterProcessingJob] Failed to invoke processor:', invokeError);
        // Don't throw - the job is created, processing might still work
      }

      return newJob.id;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[useFooterProcessingJob] Create job error:', errorMsg);
      setError(errorMsg);
      options.onError?.(errorMsg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [options.onError]);

  // Fetch an existing job
  const fetchJob = useCallback(async (id: string): Promise<FooterProcessingJob | null> => {
    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('footer_processing_jobs')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError || !data) {
        throw new Error(fetchError?.message || 'Job not found');
      }

      const fetchedJob = data as unknown as FooterProcessingJob;
      setJobId(id);
      setJob(fetchedJob);
      return fetchedJob;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error';
      console.error('[useFooterProcessingJob] Fetch job error:', errorMsg);
      setError(errorMsg);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Update job status to completed
  const completeJob = useCallback(async () => {
    if (!jobId) return;

    const { error: updateError } = await supabase
      .from('footer_processing_jobs')
      .update({ status: 'completed' })
      .eq('id', jobId);

    if (updateError) {
      console.error('[useFooterProcessingJob] Failed to complete job:', updateError);
    }
  }, [jobId]);

  // Reset state
  const reset = useCallback(() => {
    setJobId(null);
    setJob(null);
    setError(null);
    setIsLoading(false);
  }, []);

  return {
    jobId,
    job,
    isLoading,
    error,
    processingStep: job?.processing_step || null,
    processingPercent: job?.processing_percent || 0,
    status: job?.status || null,
    slices: job?.slices || null,
    legalSection: job?.legal_section || null,
    createJob,
    fetchJob,
    completeJob,
    reset
  };
}
