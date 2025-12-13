export interface EmailBlock {
  id: string;
  name: string;
  type: 'code' | 'image';
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  suggestedLink?: string;
  altText?: string;
}

export interface AnalysisResult {
  blocks: EmailBlock[];
  originalWidth: number;
  originalHeight: number;
}
