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

// Auto-detected slice from OmniParser + Claude pipeline (vertical-only)
export interface AutoDetectedSlice {
  id: string;
  yStartPercent: number;
  yEndPercent: number;
  type: string;
  label: string;
  clickable: boolean;
}

// Response from auto-slice-email edge function
export interface AutoSliceResponse {
  success: boolean;
  slices: AutoDetectedSlice[];
  metadata: {
    imageWidth: number;
    imageHeight: number;
    processingTimeMs: number;
  };
  error?: string;
  debug?: {
    cuts: number[];
    sections: { type: string; label: string }[];
  };
}

// V2 Auto-slice response (Claude as sole decision maker)
export interface AutoSliceV2Response {
  success: boolean;
  footerStartY: number;
  slices: { 
    yTop: number; 
    yBottom: number;
    name: string;
    hasCTA: boolean;
    ctaText: string | null;
    // Horizontal split detection (rare - for side-by-side products)
    horizontalSplit?: {
      columns: 2 | 3 | 4 | 5 | 6;
      gutterPositions: number[];
    };
    // Link intelligence outputs (when link index is provided)
    isClickable?: boolean;
    link?: string | null;
    altText?: string;
    linkSource?: 'index' | 'default' | 'rule' | 'needs_search' | 'not_clickable';
  }[];
  imageHeight: number;
  imageWidth: number;
  processingTimeMs: number;
  confidence: {
    overall: 'high' | 'medium' | 'low';
  };
  // For reactive web search (rare - only when product not in index)
  needsLinkSearch?: Array<{
    sliceIndex: number;
    description: string;
  }>;
  error?: string;
  debug?: {
    paragraphCount: number;
    objectCount: number;
    logoCount: number;
    edgeCount?: number;
    claudeSections?: { name: string; yTop: number; yBottom: number; hasCTA: boolean; ctaText: string | null }[];
    scaleFactor?: number;
    originalDimensions?: { width: number; height: number };
    claudeImageDimensions?: { width: number; height: number };
    linkIndexSize?: number;
  };
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
