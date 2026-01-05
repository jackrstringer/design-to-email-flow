import React, { useState, useEffect } from 'react';
import { fetchBrands, Brand } from '../api';

interface BrandSelectorProps {
  selectedBrand: Brand | null;
  frameSelection: { name: string; width: number; height: number } | null;
  onBrandSelect: (brand: Brand) => void;
  onExportFrame: () => void;
}

export function BrandSelector({ 
  selectedBrand, 
  frameSelection, 
  onBrandSelect, 
  onExportFrame 
}: BrandSelectorProps) {
  const [brands, setBrands] = useState<Brand[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadBrands();
  }, []);

  async function loadBrands() {
    try {
      setLoading(true);
      const data = await fetchBrands();
      setBrands(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load brands');
    } finally {
      setLoading(false);
    }
  }

  const filteredBrands = brands.filter(brand => 
    brand.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    brand.domain.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div style={styles.container}>
      {/* Brand Selection */}
      <div style={styles.section}>
        <label style={styles.label}>1. Select Brand</label>
        
        <input
          type="text"
          placeholder="Search brands..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={styles.searchInput}
        />

        {loading ? (
          <div style={styles.loading}>Loading brands...</div>
        ) : error ? (
          <div style={styles.error}>{error}</div>
        ) : (
          <div style={styles.brandList}>
            {filteredBrands.map(brand => (
              <button
                key={brand.id}
                onClick={() => onBrandSelect(brand)}
                style={{
                  ...styles.brandItem,
                  ...(selectedBrand?.id === brand.id ? styles.brandItemSelected : {})
                }}
              >
                <div 
                  style={{ 
                    ...styles.brandColor, 
                    background: brand.primary_color 
                  }} 
                />
                <div style={styles.brandInfo}>
                  <div style={styles.brandName}>{brand.name}</div>
                  <div style={styles.brandDomain}>{brand.domain}</div>
                </div>
                {selectedBrand?.id === brand.id && (
                  <span style={styles.checkmark}>✓</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Frame Selection */}
      {selectedBrand && (
        <div style={styles.section}>
          <label style={styles.label}>2. Select Frame in Figma</label>
          
          {frameSelection ? (
            <div style={styles.frameInfo}>
              <div style={styles.frameName}>{frameSelection.name}</div>
              <div style={styles.frameDimensions}>
                {Math.round(frameSelection.width)} × {Math.round(frameSelection.height)}
              </div>
            </div>
          ) : (
            <div style={styles.hint}>
              Click on a frame in your Figma canvas
            </div>
          )}
        </div>
      )}

      {/* Continue Button */}
      {selectedBrand && frameSelection && (
        <div style={styles.footer}>
          <button 
            onClick={onExportFrame}
            style={styles.continueButton}
          >
            Continue to Slicing
          </button>
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  label: {
    fontSize: '12px',
    fontWeight: 600,
    color: '#999',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  },
  searchInput: {
    padding: '8px 12px',
    background: '#2c2c2c',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#fff',
    fontSize: '12px',
    outline: 'none',
  },
  brandList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    maxHeight: '200px',
    overflow: 'auto',
  },
  brandItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 12px',
    background: '#2c2c2c',
    border: '1px solid #444',
    borderRadius: '4px',
    cursor: 'pointer',
    textAlign: 'left',
    color: '#fff',
  },
  brandItemSelected: {
    background: '#0d99ff20',
    borderColor: '#0d99ff',
  },
  brandColor: {
    width: '24px',
    height: '24px',
    borderRadius: '4px',
    flexShrink: 0,
  },
  brandInfo: {
    flex: 1,
    minWidth: 0,
  },
  brandName: {
    fontSize: '13px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  brandDomain: {
    fontSize: '11px',
    color: '#888',
  },
  checkmark: {
    color: '#0d99ff',
    fontWeight: 600,
  },
  loading: {
    padding: '20px',
    textAlign: 'center',
    color: '#888',
  },
  error: {
    padding: '12px',
    background: '#ff444420',
    border: '1px solid #ff4444',
    borderRadius: '4px',
    color: '#ff4444',
    fontSize: '12px',
  },
  frameInfo: {
    padding: '12px',
    background: '#2c2c2c',
    borderRadius: '4px',
    border: '1px solid #0d99ff',
  },
  frameName: {
    fontSize: '13px',
    fontWeight: 500,
    marginBottom: '4px',
  },
  frameDimensions: {
    fontSize: '11px',
    color: '#888',
  },
  hint: {
    padding: '12px',
    background: '#2c2c2c',
    borderRadius: '4px',
    color: '#888',
    fontSize: '12px',
    textAlign: 'center',
  },
  footer: {
    marginTop: 'auto',
    paddingTop: '16px',
  },
  continueButton: {
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
