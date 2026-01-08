export type SliceType = 'image' | 'html';

export interface ProcessedSlice {
  imageUrl: string;
  altText: string;
  link: string | null;
  isClickable: boolean;
  type: SliceType;
  htmlContent?: string; // For HTML type slices
  linkVerified?: boolean; // Was this link verified via web search?
  linkWarning?: string; // Warning if unverified or external
  column?: number; // Which column (0-based) in a multi-column row
  totalColumns?: number; // Total columns in this row (1-4)
  rowIndex?: number; // Which row this slice belongs to
}

export interface SliceInput {
  dataUrl: string;
  index: number;
  type: SliceType;
}

export interface SliceAnalysis {
  index: number;
  altText: string;
  suggestedLink: string | null;
  isClickable: boolean;
  htmlContent?: string;
  linkVerified?: boolean; // Was this link verified via web search?
  linkWarning?: string; // Warning if unverified or external
}

// Auto-detected slice from Grounding DINO + Claude pipeline
export interface AutoDetectedSlice {
  id: string;
  yStartPercent: number;
  yEndPercent: number;
  type: string;
  columns: number;
  label: string;
  clickable: boolean;
  columnBounds?: { xStartPercent: number; xEndPercent: number }[];
}

// Response from auto-slice-email edge function
export interface AutoSliceResponse {
  success: boolean;
  slices: AutoDetectedSlice[];
  metadata: {
    imageWidth: number;
    imageHeight: number;
    omniParserElementCount: number;
    processingTimeMs: number;
  };
  error?: string;
}

// Legacy types (kept for backward compatibility during transition)
export type AutoSectionType = 'header' | 'hero' | 'product_grid' | 'cta' | 'text_block' | 'divider' | 'footer' | 'unknown';

export interface AutoDetectedSection {
  type: AutoSectionType;
  columns: 1 | 2 | 3 | 4;
  description: string;
  gutterPositions?: number[]; // X-percentages for column splits (from CV)
}

export interface AutoSliceResult {
  slicePositions: number[];      // Y-percentages
  sections: AutoDetectedSection[];
  edgeCandidatesCount: number;
  confidence: number;
}
