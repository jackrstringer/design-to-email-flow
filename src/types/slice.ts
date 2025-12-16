export type SliceType = 'image' | 'html';

export interface ProcessedSlice {
  imageUrl: string;
  altText: string;
  link: string | null;
  isClickable: boolean;
  type: SliceType;
  htmlContent?: string; // For HTML type slices
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
}
