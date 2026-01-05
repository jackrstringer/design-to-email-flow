import React, { useState } from 'react';

interface SuccessScreenProps {
  campaignId: string;
  campaignName: string;
  onStartOver: () => void;
}

// This should match your production URL
const APP_URL = 'https://preview--redo-it-again.lovable.app';

export function SuccessScreen({ campaignId, campaignName, onStartOver }: SuccessScreenProps) {
  const [copied, setCopied] = useState(false);
  
  const campaignUrl = `${APP_URL}/campaign/${campaignId}`;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(campaignUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleOpenUrl = () => {
    // In Figma plugin, we can't open URLs directly, so we just copy
    handleCopy();
    parent.postMessage({ 
      pluginMessage: { 
        type: 'notify', 
        message: 'URL copied! Paste in browser to view campaign.',
        timeout: 3000
      } 
    }, '*');
  };

  return (
    <div style={styles.container}>
      <div style={styles.content}>
        {/* Success icon */}
        <div style={styles.iconContainer}>
          <div style={styles.icon}>✓</div>
        </div>

        {/* Title */}
        <h2 style={styles.title}>Campaign Created!</h2>
        <p style={styles.subtitle}>{campaignName}</p>

        {/* URL display */}
        <div style={styles.urlContainer}>
          <div style={styles.urlLabel}>Campaign URL</div>
          <div style={styles.urlBox}>
            <span style={styles.urlText}>{campaignUrl}</span>
            <button 
              onClick={handleCopy}
              style={styles.copyButton}
            >
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button 
            onClick={handleOpenUrl}
            style={styles.primaryButton}
          >
            Copy & Open Campaign
          </button>
          
          <button 
            onClick={onStartOver}
            style={styles.secondaryButton}
          >
            Create Another Campaign
          </button>
        </div>
      </div>

      {/* Close button */}
      <button 
        onClick={() => parent.postMessage({ pluginMessage: { type: 'close' } }, '*')}
        style={styles.closeButton}
      >
        Close Plugin
      </button>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    padding: '24px',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: '16px',
  },
  iconContainer: {
    width: '64px',
    height: '64px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #00c853 0%, #00e676 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '8px',
  },
  icon: {
    fontSize: '32px',
    color: '#fff',
    fontWeight: 'bold',
  },
  title: {
    fontSize: '20px',
    fontWeight: 600,
    color: '#fff',
    margin: 0,
  },
  subtitle: {
    fontSize: '14px',
    color: '#888',
    margin: 0,
  },
  urlContainer: {
    width: '100%',
    marginTop: '16px',
  },
  urlLabel: {
    fontSize: '11px',
    color: '#888',
    textTransform: 'uppercase',
    marginBottom: '8px',
    textAlign: 'left',
  },
  urlBox: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 12px',
    background: '#2c2c2c',
    border: '1px solid #444',
    borderRadius: '6px',
  },
  urlText: {
    flex: 1,
    fontSize: '12px',
    color: '#0d99ff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },
  copyButton: {
    padding: '6px 12px',
    background: '#444',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '11px',
    cursor: 'pointer',
    flexShrink: 0,
  },
  actions: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    marginTop: '24px',
  },
  primaryButton: {
    width: '100%',
    padding: '14px',
    background: '#0d99ff',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
  },
  secondaryButton: {
    width: '100%',
    padding: '12px',
    background: 'transparent',
    border: '1px solid #444',
    borderRadius: '6px',
    color: '#888',
    fontSize: '13px',
    cursor: 'pointer',
  },
  closeButton: {
    marginTop: '16px',
    padding: '10px',
    background: 'transparent',
    border: 'none',
    color: '#666',
    fontSize: '12px',
    cursor: 'pointer',
  },
};
