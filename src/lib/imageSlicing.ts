export interface ImageSlice {
  dataUrl: string;
  startPercent: number;
  endPercent: number;
  height: number;
  width: number;
}

const MAX_AI_DIMENSION = 8000;

/**
 * Resize an image if either dimension exceeds the max limit for AI processing
 * Maintains aspect ratio and returns original if within limits
 */
export async function resizeImageForAI(
  imageDataUrl: string,
  maxDimension: number = MAX_AI_DIMENSION
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const { naturalWidth, naturalHeight } = img;
      
      // Check if resize is needed
      if (naturalWidth <= maxDimension && naturalHeight <= maxDimension) {
        resolve(imageDataUrl); // Return original if within limits
        return;
      }
      
      console.log(`Resizing image from ${naturalWidth}x${naturalHeight} for AI processing`);
      
      // Calculate new dimensions maintaining aspect ratio
      let newWidth = naturalWidth;
      let newHeight = naturalHeight;
      
      if (naturalWidth > naturalHeight) {
        // Width is the limiting factor
        if (naturalWidth > maxDimension) {
          newWidth = maxDimension;
          newHeight = Math.round((naturalHeight * maxDimension) / naturalWidth);
        }
      } else {
        // Height is the limiting factor
        if (naturalHeight > maxDimension) {
          newHeight = maxDimension;
          newWidth = Math.round((naturalWidth * maxDimension) / naturalHeight);
        }
      }
      
      console.log(`Resized to ${newWidth}x${newHeight}`);
      
      // Resize using canvas
      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, newWidth, newHeight);
      resolve(canvas.toDataURL('image/jpeg', 0.85)); // Use JPEG for smaller size
    };
    
    img.onerror = () => reject(new Error('Failed to load image for resizing'));
    img.src = imageDataUrl;
  });
}

/**
 * Slice an image into multiple parts based on Y-axis percentages
 * @param imageDataUrl - Base64 data URL of the image
 * @param slicePositions - Array of percentages (0-100) including 0 and 100 as boundaries
 * @returns Array of sliced image data URLs with metadata
 */
export async function sliceImage(
  imageDataUrl: string, 
  slicePositions: number[]
): Promise<ImageSlice[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      const slices: ImageSlice[] = [];
      const totalHeight = img.naturalHeight;
      const width = img.naturalWidth;

      // Sort positions and ensure they're valid
      const sortedPositions = [...slicePositions].sort((a, b) => a - b);

      // Create slices between each pair of positions
      for (let i = 0; i < sortedPositions.length - 1; i++) {
        const startPercent = sortedPositions[i];
        const endPercent = sortedPositions[i + 1];
        
        const startY = Math.round((startPercent / 100) * totalHeight);
        const endY = Math.round((endPercent / 100) * totalHeight);
        const sliceHeight = endY - startY;

        if (sliceHeight <= 0) continue;

        // Create canvas for this slice
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = sliceHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not get canvas context'));
          return;
        }

        // Draw the slice portion
        ctx.drawImage(
          img,
          0, startY,           // Source x, y
          width, sliceHeight,  // Source width, height
          0, 0,                // Dest x, y
          width, sliceHeight   // Dest width, height
        );

        slices.push({
          dataUrl: canvas.toDataURL('image/png'),
          startPercent,
          endPercent,
          height: sliceHeight,
          width
        });
      }

      resolve(slices);
    };

    img.onerror = () => {
      reject(new Error('Failed to load image for slicing'));
    };

    img.src = imageDataUrl;
  });
}

/**
 * Get image dimensions from a data URL
 */
export async function getImageDimensions(imageDataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = imageDataUrl;
  });
}
