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
