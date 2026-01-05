import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Brand, analyzeSlices, uploadToCloudinary } from '../api';

interface SliceEditorProps {
  imageData: string; // base64
  imageWidth: number;
  imageHeight: number;
  brand: Brand;
  onBack: () => void;
  onSlicesProcessed: (slices: ProcessedSlice[]) => void;
}

interface ProcessedSlice {
  dataUrl: string;
  index: number;
  altText: string;
  link: string;
  isClickable: boolean;
}

interface SlicePosition {
  id: string;
  percent: number;
}

export function SliceEditor({
  imageData,
  imageWidth,
  imageHeight,
  brand,
  onBack,
  onSlicesProcessed
}: SliceEditorProps) {
  const [slicePositions, setSlicePositions] = useState<SlicePosition[]>([]);
  const [footerCutoff, setFooterCutoff] = useState(100); // percent from top
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerHeight, setContainerHeight] = useState(0);

  const imageDataUrl = `data:image/png;base64,${imageData}`;

  useEffect(() => {
    if (containerRef.current) {
      const updateHeight = () => {
        if (containerRef.current) {
          setContainerHeight(containerRef.current.offsetHeight);
        }
      };
      updateHeight();
      const observer = new ResizeObserver(updateHeight);
      observer.observe(containerRef.current);
      return () => observer.disconnect();
    }
  }, []);

  const handleImageClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const percentY = (clickY / rect.height) * 100;
    
    // Don't add slice below footer cutoff
    if (percentY >= footerCutoff) return;
    
    // Don't add too close to existing lines
    const tooClose = slicePositions.some(pos => Math.abs(pos.percent - percentY) < 3);
    if (tooClose) return;

    setSlicePositions(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      percent: percentY
    }].sort((a, b) => a.percent - b.percent));
  }, [footerCutoff, slicePositions]);

  const handleSliceMove = (id: string, newPercent: number) => {
    setSlicePositions(prev => 
      prev.map(pos => pos.id === id ? { ...pos, percent: Math.max(1, Math.min(footerCutoff - 1, newPercent)) } : pos)
        .sort((a, b) => a.percent - b.percent)
    );
  };

  const handleSliceDelete = (id: string) => {
    setSlicePositions(prev => prev.filter(pos => pos.id !== id));
  };

  const handleFooterDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    
    const startY = e.clientY;
    const startCutoff = footerCutoff;
    
    const handleMove = (moveEvent: MouseEvent) => {
      if (!containerRef.current) return;
      const deltaY = moveEvent.clientY - startY;
      const deltaPercent = (deltaY / containerRef.current.offsetHeight) * 100;
      const newCutoff = Math.max(10, Math.min(100, startCutoff + deltaPercent));
      setFooterCutoff(newCutoff);
      
      // Remove any slices below new cutoff
      setSlicePositions(prev => prev.filter(pos => pos.percent < newCutoff - 1));
    };
    
    const handleUp = () => {
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  }, [footerCutoff]);

  const handleProcess = async () => {
    setIsProcessing(true);
    setProgress('Creating slices...');

    try {
      // Create canvas and draw image
      const img = new Image();
      img.src = imageDataUrl;
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d')!;
      
      // Calculate pixel positions
      const sliceYPositions = slicePositions.map(pos => (pos.percent / 100) * img.height);
      const footerY = (footerCutoff / 100) * img.height;

      // Create slice regions
      const regions: { top: number; bottom: number }[] = [];
      let lastY = 0;
      
      for (const y of sliceYPositions) {
        regions.push({ top: lastY, bottom: y });
        lastY = y;
      }
      regions.push({ top: lastY, bottom: footerY });

      // Generate slice images
      setProgress(`Generating ${regions.length} slice images...`);
      const sliceDataUrls: string[] = [];
      
      for (let i = 0; i < regions.length; i++) {
        const region = regions[i];
        const height = region.bottom - region.top;
        
        canvas.width = img.width;
        canvas.height = height;
        ctx.drawImage(img, 0, region.top, img.width, height, 0, 0, img.width, height);
        
        sliceDataUrls.push(canvas.toDataURL('image/png'));
      }

      // Upload full image first
      setProgress('Uploading image...');
      const fullImageUrl = await uploadToCloudinary(imageData, 'campaigns');

      // Analyze slices with AI
      setProgress('Analyzing slices with AI...');
      const slicesForAnalysis = sliceDataUrls.map((dataUrl, index) => ({
        dataUrl,
        index
      }));

      const analysis = await analyzeSlices(
        slicesForAnalysis,
        brand.website_url || `https://${brand.domain}`,
        brand.domain,
        fullImageUrl
      );

      // Combine slices with analysis
      const processedSlices: ProcessedSlice[] = sliceDataUrls.map((dataUrl, index) => {
        const sliceAnalysis = analysis.find(a => a.index === index);
        return {
          dataUrl,
          index,
          altText: sliceAnalysis?.altText || `Email section ${index + 1}`,
          link: sliceAnalysis?.suggestedLink || '',
          isClickable: sliceAnalysis?.isClickable ?? false
        };
      });

      onSlicesProcessed(processedSlices);
    } catch (error) {
      console.error('Processing error:', error);
      setProgress(`Error: ${error instanceof Error ? error.message : 'Processing failed'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  const sliceCount = slicePositions.length + 1;

  return (
    <div style={styles.container}>
      {/* Toolbar */}
      <div style={styles.toolbar}>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
        <div style={styles.info}>
          Click to add slice lines · Drag red handle to exclude footer
        </div>
      </div>

      {/* Image container */}
      <div 
        ref={containerRef}
        style={styles.imageContainer}
        onClick={handleImageClick}
      >
        <img 
          src={imageDataUrl} 
          alt="Frame to slice" 
          style={styles.image}
          draggable={false}
        />
        
        {/* Slice lines */}
        {slicePositions.map((pos, idx) => (
          <SliceLine
            key={pos.id}
            position={pos.percent}
            index={idx}
            containerHeight={containerHeight}
            onMove={(newPercent) => handleSliceMove(pos.id, newPercent)}
            onDelete={() => handleSliceDelete(pos.id)}
          />
        ))}

        {/* Footer cutoff handle */}
        <div 
          style={{ 
            ...styles.footerHandle, 
            top: `${footerCutoff}%` 
          }}
          onMouseDown={handleFooterDrag}
        >
          <div style={styles.footerLine} />
          <div style={styles.footerLabel}>Footer (excluded)</div>
        </div>

        {/* Footer overlay */}
        <div 
          style={{ 
            ...styles.footerOverlay, 
            top: `${footerCutoff}%`,
            height: `${100 - footerCutoff}%`
          }} 
        />
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        <div style={styles.sliceCount}>
          {sliceCount} slice{sliceCount !== 1 ? 's' : ''}
        </div>
        
        {isProcessing ? (
          <div style={styles.progress}>{progress}</div>
        ) : (
          <button 
            onClick={handleProcess}
            style={styles.processButton}
          >
            Process Slices
          </button>
        )}
      </div>
    </div>
  );
}

// Sub-component for slice lines
function SliceLine({ 
  position, 
  index, 
  containerHeight,
  onMove, 
  onDelete 
}: { 
  position: number; 
  index: number;
  containerHeight: number;
  onMove: (newPercent: number) => void;
  onDelete: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
    
    const startY = e.clientY;
    const startPercent = position;
    
    const handleMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      const deltaPercent = (deltaY / containerHeight) * 100;
      onMove(startPercent + deltaPercent);
    };
    
    const handleUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
    };
    
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mouseup', handleUp);
  };

  return (
    <div 
      style={{ 
        ...styles.sliceLine, 
        top: `${position}%`,
        zIndex: isDragging ? 20 : 10
      }}
      onMouseDown={handleMouseDown}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={styles.sliceLineBar} />
      <div style={styles.sliceLabel}>
        Slice {index + 1}
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={styles.deleteButton}
        >
          ×
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  toolbar: {
    padding: '8px 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    borderBottom: '1px solid #333',
    flexShrink: 0,
  },
  backButton: {
    padding: '6px 12px',
    background: '#333',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    cursor: 'pointer',
  },
  info: {
    fontSize: '11px',
    color: '#888',
  },
  imageContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'auto',
    cursor: 'crosshair',
  },
  image: {
    display: 'block',
    width: '100%',
    height: 'auto',
    userSelect: 'none',
  },
  sliceLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    transform: 'translateY(-50%)',
    cursor: 'ns-resize',
  },
  sliceLineBar: {
    height: '2px',
    background: '#0d99ff',
    borderTop: '1px dashed #0d99ff',
    borderBottom: '1px dashed #0d99ff',
  },
  sliceLabel: {
    position: 'absolute',
    left: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
    padding: '2px 8px',
    background: '#0d99ff',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 600,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  deleteButton: {
    background: 'none',
    border: 'none',
    color: '#fff',
    fontSize: '14px',
    cursor: 'pointer',
    padding: 0,
    lineHeight: 1,
  },
  footerHandle: {
    position: 'absolute',
    left: 0,
    right: 0,
    transform: 'translateY(-50%)',
    cursor: 'ns-resize',
    zIndex: 15,
  },
  footerLine: {
    height: '3px',
    background: '#ff4444',
  },
  footerLabel: {
    position: 'absolute',
    right: '8px',
    top: '50%',
    transform: 'translateY(-50%)',
    padding: '2px 8px',
    background: '#ff4444',
    borderRadius: '3px',
    fontSize: '10px',
    fontWeight: 600,
    color: '#fff',
  },
  footerOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    background: 'rgba(255, 68, 68, 0.3)',
    pointerEvents: 'none',
  },
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  sliceCount: {
    fontSize: '12px',
    color: '#888',
  },
  progress: {
    fontSize: '12px',
    color: '#0d99ff',
  },
  processButton: {
    padding: '8px 16px',
    background: '#0d99ff',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
