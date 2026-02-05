import { useState, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface UseScreenCaptureOptions {
  targetRef: React.RefObject<HTMLElement>;
}

interface UseScreenCaptureReturn {
  isCapturing: boolean;
  isCaptureEnabled: boolean;
  enableCapture: () => Promise<boolean>;
  captureScreenshot: () => Promise<string | null>;
  stopCapture: () => void;
}

/**
 * Hook for capturing true pixel-perfect screenshots using the Screen Capture API.
 * This captures exactly what the user sees on screen, not a DOM render.
 */
export function useScreenCapture({ targetRef }: UseScreenCaptureOptions): UseScreenCaptureReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCaptureEnabled, setIsCaptureEnabled] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const enableCapture = useCallback(async (): Promise<boolean> => {
    try {
      // Request screen capture permission
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          displaySurface: 'browser', // Prefer current tab
        },
        audio: false,
        // @ts-ignore - preferCurrentTab is a valid option but not in all TS defs
        preferCurrentTab: true,
      });

      streamRef.current = stream;

      // Create a hidden video element to receive the stream
      const video = document.createElement('video');
      video.srcObject = stream;
      video.muted = true;
      video.playsInline = true;
      await video.play();
      videoRef.current = video;

      // Listen for stream ending (user stops sharing)
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        setIsCaptureEnabled(false);
        streamRef.current = null;
        videoRef.current = null;
      });

      setIsCaptureEnabled(true);
      toast.success('Screen capture enabled');
      return true;
    } catch (err) {
      console.error('Failed to enable screen capture:', err);
      toast.error('Screen capture permission denied');
      return false;
    }
  }, []);

  const stopCapture = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }
    setIsCaptureEnabled(false);
  }, []);

  const captureScreenshot = useCallback(async (): Promise<string | null> => {
    if (!isCaptureEnabled || !videoRef.current || !targetRef.current) {
      console.warn('Screen capture not enabled or target not available');
      return null;
    }

    setIsCapturing(true);

    try {
      const video = videoRef.current;
      
      // Get the target element's bounding rect
      const targetRect = targetRef.current.getBoundingClientRect();
      
      // Calculate scale factor (video might be different resolution than screen)
      const scaleX = video.videoWidth / window.innerWidth;
      const scaleY = video.videoHeight / window.innerHeight;
      
      // Calculate the crop region in video coordinates
      const cropX = Math.round(targetRect.left * scaleX);
      const cropY = Math.round(targetRect.top * scaleY);
      const cropWidth = Math.round(targetRect.width * scaleX);
      const cropHeight = Math.round(targetRect.height * scaleY);

      // Create canvas and draw the cropped region
      const canvas = document.createElement('canvas');
      canvas.width = cropWidth;
      canvas.height = cropHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('Failed to get canvas context');
      }

      // Draw the cropped portion of the video frame
      ctx.drawImage(
        video,
        cropX, cropY, cropWidth, cropHeight, // Source rect
        0, 0, cropWidth, cropHeight // Dest rect
      );

      // Add labels to make it crystal clear which side is which
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      
      // Find the approximate center of each panel (assuming 50/50 split)
      const leftCenter = cropWidth * 0.25;
      const rightCenter = cropWidth * 0.75;
      
      // Draw label backgrounds
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(leftCenter - 80, 8, 160, 24);
      ctx.fillRect(rightCenter - 80, 8, 160, 24);
      
      // Draw labels
      ctx.fillStyle = '#FFD700'; // Gold for reference
      ctx.fillText('← REFERENCE (TARGET)', leftCenter, 25);
      ctx.fillStyle = '#00FF00'; // Green for current
      ctx.fillText('CURRENT HTML →', rightCenter, 25);

      // Convert to data URL
      const dataUrl = canvas.toDataURL('image/png');

      // Upload to ImageKit
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('upload-to-imagekit', {
        body: { 
          imageData: dataUrl,
          folder: 'screen-captures'
        }
      });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      console.log('Screen capture uploaded:', uploadData.url);
      return uploadData.url;
    } catch (err) {
      console.error('Failed to capture screenshot:', err);
      toast.error('Screenshot capture failed');
      return null;
    } finally {
      setIsCapturing(false);
    }
  }, [isCaptureEnabled, targetRef]);

  return {
    isCapturing,
    isCaptureEnabled,
    enableCapture,
    captureScreenshot,
    stopCapture,
  };
}
