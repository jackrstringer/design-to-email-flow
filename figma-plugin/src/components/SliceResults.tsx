import React, { useState } from 'react';
import { Brand, createCampaign, uploadToCloudinary } from '../api';

interface ProcessedSlice {
  dataUrl: string;
  index: number;
  altText: string;
  link: string;
  isClickable: boolean;
}

interface SliceResultsProps {
  slices: ProcessedSlice[];
  brand: Brand;
  campaignName: string;
  onCampaignNameChange: (name: string) => void;
  onSlicesChange: (slices: ProcessedSlice[]) => void;
  onBack: () => void;
  onCampaignCreated: (id: string) => void;
}

export function SliceResults({
  slices,
  brand,
  campaignName,
  onCampaignNameChange,
  onSlicesChange,
  onBack,
  onCampaignCreated
}: SliceResultsProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [progress, setProgress] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const updateSlice = (index: number, updates: Partial<ProcessedSlice>) => {
    onSlicesChange(slices.map((s, i) => i === index ? { ...s, ...updates } : s));
  };

  const handleCreateCampaign = async () => {
    setIsCreating(true);
    setProgress('Uploading images...');

    try {
      // Upload all slice images to Cloudinary
      const uploadedSlices = await Promise.all(
        slices.map(async (slice, index) => {
          setProgress(`Uploading slice ${index + 1}/${slices.length}...`);
          const base64 = slice.dataUrl.split(',')[1];
          const url = await uploadToCloudinary(base64, `campaigns/${brand.domain}`);
          return { ...slice, imageUrl: url };
        })
      );

      // Generate HTML for the email
      setProgress('Generating email HTML...');
      const html = generateEmailHtml(uploadedSlices, brand);

      // Create campaign in database
      setProgress('Creating campaign...');
      const blocks = uploadedSlices.map(slice => ({
        type: 'image' as const,
        imageUrl: slice.imageUrl,
        altText: slice.altText,
        link: slice.isClickable ? slice.link : undefined
      }));

      const campaign = await createCampaign(
        campaignName,
        brand.id,
        blocks,
        html,
        uploadedSlices[0]?.imageUrl
      );

      onCampaignCreated(campaign.id);
    } catch (error) {
      console.error('Create campaign error:', error);
      setProgress(`Error: ${error instanceof Error ? error.message : 'Failed to create campaign'}`);
      setIsCreating(false);
    }
  };

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
        <input
          type="text"
          value={campaignName}
          onChange={(e) => onCampaignNameChange(e.target.value)}
          style={styles.nameInput}
          placeholder="Campaign name"
        />
      </div>

      {/* Slices list */}
      <div style={styles.sliceList}>
        {slices.map((slice, index) => (
          <div key={index} style={styles.sliceItem}>
            <img 
              src={slice.dataUrl} 
              alt={slice.altText}
              style={styles.sliceThumb}
            />
            
            <div style={styles.sliceDetails}>
              <div style={styles.sliceIndex}>Slice {index + 1}</div>
              
              {/* Alt text */}
              <div style={styles.field}>
                <label style={styles.fieldLabel}>Alt Text</label>
                <input
                  type="text"
                  value={slice.altText}
                  onChange={(e) => updateSlice(index, { altText: e.target.value })}
                  style={styles.input}
                  placeholder="Describe this image..."
                />
              </div>

              {/* Link toggle and input */}
              <div style={styles.field}>
                <div style={styles.linkHeader}>
                  <label style={styles.fieldLabel}>Link</label>
                  <button
                    onClick={() => updateSlice(index, { isClickable: !slice.isClickable })}
                    style={{
                      ...styles.toggleButton,
                      ...(slice.isClickable ? styles.toggleActive : {})
                    }}
                  >
                    {slice.isClickable ? 'Enabled' : 'Disabled'}
                  </button>
                </div>
                
                {slice.isClickable && (
                  <input
                    type="text"
                    value={slice.link}
                    onChange={(e) => updateSlice(index, { link: e.target.value })}
                    style={styles.input}
                    placeholder="https://..."
                  />
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={styles.footer}>
        {isCreating ? (
          <div style={styles.progress}>{progress}</div>
        ) : (
          <button 
            onClick={handleCreateCampaign}
            style={styles.createButton}
            disabled={!campaignName.trim()}
          >
            Create Campaign
          </button>
        )}
      </div>
    </div>
  );
}

function generateEmailHtml(slices: any[], brand: Brand): string {
  const slicesHtml = slices.map(slice => {
    const imgTag = `<img src="${slice.imageUrl}" alt="${slice.altText}" style="display: block; width: 100%; max-width: 600px; height: auto;" />`;
    
    if (slice.isClickable && slice.link) {
      return `<a href="${slice.link}" target="_blank" style="display: block;">${imgTag}</a>`;
    }
    return imgTag;
  }).join('\n');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${brand.name}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f5f5f5;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td align="center" style="padding: 20px 0;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width: 600px; width: 100%;">
          <tr>
            <td style="background-color: #ffffff;">
              ${slicesHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  header: {
    padding: '12px 16px',
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
    flexShrink: 0,
  },
  nameInput: {
    flex: 1,
    padding: '8px 12px',
    background: '#2c2c2c',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 500,
  },
  sliceList: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  sliceItem: {
    display: 'flex',
    gap: '12px',
    padding: '12px',
    background: '#2c2c2c',
    borderRadius: '6px',
    border: '1px solid #444',
  },
  sliceThumb: {
    width: '80px',
    height: '60px',
    objectFit: 'cover',
    borderRadius: '4px',
    flexShrink: 0,
  },
  sliceDetails: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sliceIndex: {
    fontSize: '11px',
    fontWeight: 600,
    color: '#888',
    textTransform: 'uppercase',
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fieldLabel: {
    fontSize: '10px',
    color: '#888',
    textTransform: 'uppercase',
  },
  input: {
    padding: '6px 10px',
    background: '#1e1e1e',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
  },
  linkHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleButton: {
    padding: '4px 8px',
    background: '#444',
    border: 'none',
    borderRadius: '3px',
    color: '#888',
    fontSize: '10px',
    cursor: 'pointer',
  },
  toggleActive: {
    background: '#0d99ff',
    color: '#fff',
  },
  footer: {
    padding: '12px 16px',
    borderTop: '1px solid #333',
    flexShrink: 0,
  },
  progress: {
    fontSize: '12px',
    color: '#0d99ff',
    textAlign: 'center',
  },
  createButton: {
    width: '100%',
    padding: '12px',
    background: '#0d99ff',
    border: 'none',
    borderRadius: '6px',
    color: '#fff',
    fontSize: '13px',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
