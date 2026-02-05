import { useState, useCallback } from 'react';
import { toPng } from 'html-to-image';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UseDomCaptureOptions {
  targetRef: React.RefObject<HTMLElement>;
}

interface UseDomCaptureReturn {
  isCapturing: boolean;
  captureScreenshot: () => Promise<string | null>;
}

/**
 * Hook for capturing DOM elements as images using html-to-image.
 * This is more reliable than Screen Capture API as it doesn't require 
 * user permission and captures exactly what's in the DOM.
 */
export function useDomCapture({ targetRef }: UseDomCaptureOptions): UseDomCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);

  const captureScreenshot = useCallback(async (): Promise<string | null> => {
    if (!targetRef.current) {
      console.warn('Target element not available for capture');
      return null;
    }

    setIsCapturing(true);

    try {
      // Capture the DOM element as PNG
      const dataUrl = await toPng(targetRef.current, {
        quality: 0.95,
        pixelRatio: 2, // High quality for Claude to analyze
        backgroundColor: '#ffffff',
        cacheBust: true, // Ensure fresh capture
        // Filter out elements that might cause issues
        filter: (node) => {
          // Skip any video or canvas elements that might be problematic
          if (node instanceof HTMLVideoElement) return false;
          return true;
        },
      });

      // Create a canvas to add labels
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.src = dataUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Draw the captured image
      ctx.drawImage(img, 0, 0);

      // Add labels to make it crystal clear which side is which
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      
      // Find the approximate center of each panel (assuming 50/50 split)
      const leftCenter = canvas.width * 0.25;
      const rightCenter = canvas.width * 0.75;
      
      // Draw label backgrounds
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(leftCenter - 140, 12, 280, 36);
      ctx.fillRect(rightCenter - 140, 12, 280, 36);
      
      // Draw labels
      ctx.fillStyle = '#FFD700'; // Gold for reference
      ctx.fillText('← REFERENCE (TARGET)', leftCenter, 38);
      ctx.fillStyle = '#00FF00'; // Green for current
      ctx.fillText('CURRENT HTML →', rightCenter, 38);

      // Convert labeled canvas to data URL
      const labeledDataUrl = canvas.toDataURL('image/png');

      // Upload to ImageKit
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('upload-to-imagekit', {
        body: { 
          imageData: labeledDataUrl,
          folder: 'dom-captures'
        }
      });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      console.log('DOM capture uploaded:', uploadData.url);
      return uploadData.url;
    } catch (err) {
      console.error('Failed to capture DOM:', err);
      toast.error('Screenshot capture failed');
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [targetRef]);

  return {
    isCapturing,
    captureScreenshot,
  };
}
