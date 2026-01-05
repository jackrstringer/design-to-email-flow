import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrandSelector } from './components/BrandSelector';
import { SliceEditor } from './components/SliceEditor';
import { SliceResults } from './components/SliceResults';
import { SuccessScreen } from './components/SuccessScreen';
import { Brand } from './api';

type Step = 'brand' | 'slice' | 'results' | 'success';

interface FrameSelection {
  name: string;
  width: number;
  height: number;
  id: string;
}

interface ExportedFrame {
  data: string;
  width: number;
  height: number;
  name: string;
}

interface ProcessedSlice {
  dataUrl: string;
  index: number;
  altText: string;
  link: string;
  isClickable: boolean;
}

function App() {
  const [step, setStep] = useState<Step>('brand');
  const [selectedBrand, setSelectedBrand] = useState<Brand | null>(null);
  const [frameSelection, setFrameSelection] = useState<FrameSelection | null>(null);
  const [exportedFrame, setExportedFrame] = useState<ExportedFrame | null>(null);
  const [processedSlices, setProcessedSlices] = useState<ProcessedSlice[]>([]);
  const [campaignId, setCampaignId] = useState<string | null>(null);
  const [campaignName, setCampaignName] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Listen for messages from the plugin code
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      console.log('[UI] Received message:', msg.type);

      if (msg.type === 'selection-result') {
        if (msg.error) {
          setError(msg.error);
        } else {
          setFrameSelection({
            name: msg.name,
            width: msg.width,
            height: msg.height,
            id: msg.id
          });
          setError(null);
        }
      }

      if (msg.type === 'selection-changed') {
        setFrameSelection({
          name: msg.name,
          width: msg.width,
          height: msg.height,
          id: msg.id
        });
        setError(null);
      }

      if (msg.type === 'export-result') {
        if (msg.error) {
          setError(msg.error);
        } else {
          setExportedFrame({
            data: msg.data,
            width: msg.width,
            height: msg.height,
            name: msg.name
          });
          setCampaignName(msg.name || 'Untitled Campaign');
          setStep('slice');
          setError(null);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Request current selection when brand is selected
  useEffect(() => {
    if (selectedBrand) {
      parent.postMessage({ pluginMessage: { type: 'get-selection' } }, '*');
    }
  }, [selectedBrand]);

  const handleBrandSelect = (brand: Brand) => {
    setSelectedBrand(brand);
  };

  const handleExportFrame = () => {
    parent.postMessage({ pluginMessage: { type: 'export-frame' } }, '*');
  };

  const handleSlicesProcessed = (slices: ProcessedSlice[]) => {
    setProcessedSlices(slices);
    setStep('results');
  };

  const handleCampaignCreated = (id: string) => {
    setCampaignId(id);
    setStep('success');
    parent.postMessage({ 
      pluginMessage: { type: 'notify', message: 'Campaign created successfully!' } 
    }, '*');
  };

  const handleBack = () => {
    if (step === 'slice') {
      setExportedFrame(null);
      setStep('brand');
    } else if (step === 'results') {
      setStep('slice');
    }
  };

  const handleStartOver = () => {
    setStep('brand');
    setSelectedBrand(null);
    setFrameSelection(null);
    setExportedFrame(null);
    setProcessedSlices([]);
    setCampaignId(null);
    setCampaignName('');
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>Email Campaign Creator</h1>
        <div style={styles.steps}>
          <span style={{ ...styles.stepDot, ...(step === 'brand' ? styles.stepActive : {}) }}>1</span>
          <span style={styles.stepLine} />
          <span style={{ ...styles.stepDot, ...(step === 'slice' ? styles.stepActive : {}) }}>2</span>
          <span style={styles.stepLine} />
          <span style={{ ...styles.stepDot, ...(step === 'results' ? styles.stepActive : {}) }}>3</span>
          <span style={styles.stepLine} />
          <span style={{ ...styles.stepDot, ...(step === 'success' ? styles.stepActive : {}) }}>✓</span>
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div style={styles.error}>
          {error}
        </div>
      )}

      {/* Content */}
      <div style={styles.content}>
        {step === 'brand' && (
          <BrandSelector 
            selectedBrand={selectedBrand}
            frameSelection={frameSelection}
            onBrandSelect={handleBrandSelect}
            onExportFrame={handleExportFrame}
          />
        )}

        {step === 'slice' && exportedFrame && selectedBrand && (
          <SliceEditor
            imageData={exportedFrame.data}
            imageWidth={exportedFrame.width}
            imageHeight={exportedFrame.height}
            brand={selectedBrand}
            onBack={handleBack}
            onSlicesProcessed={handleSlicesProcessed}
          />
        )}

        {step === 'results' && selectedBrand && (
          <SliceResults
            slices={processedSlices}
            brand={selectedBrand}
            campaignName={campaignName}
            onCampaignNameChange={setCampaignName}
            onSlicesChange={setProcessedSlices}
            onBack={handleBack}
            onCampaignCreated={handleCampaignCreated}
          />
        )}

        {step === 'success' && campaignId && (
          <SuccessScreen
            campaignId={campaignId}
            campaignName={campaignName}
            onStartOver={handleStartOver}
          />
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    background: '#1e1e1e',
  },
  header: {
    padding: '16px',
    borderBottom: '1px solid #333',
    flexShrink: 0,
  },
  title: {
    fontSize: '16px',
    fontWeight: 600,
    marginBottom: '12px',
    color: '#fff',
  },
  steps: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  stepDot: {
    width: '24px',
    height: '24px',
    borderRadius: '50%',
    background: '#333',
    color: '#888',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '11px',
    fontWeight: 600,
  },
  stepActive: {
    background: '#0d99ff',
    color: '#fff',
  },
  stepLine: {
    flex: 1,
    height: '2px',
    background: '#333',
  },
  error: {
    margin: '8px 16px',
    padding: '8px 12px',
    background: '#ff4444',
    borderRadius: '4px',
    fontSize: '12px',
    color: '#fff',
  },
  content: {
    flex: 1,
    overflow: 'auto',
  },
};

// Mount the app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}
