const SUPABASE_URL = 'https://esrimjavbjdtecszxudc.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcmltamF2YmpkdGVjc3p4dWRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjU2NDYyNTIsImV4cCI6MjA4MTIyMjI1Mn0._OKclwB9zROzpS-Y1W5mvZiVmwM5xLhvn-kF0AInWlE';

export interface Brand {
  id: string;
  name: string;
  domain: string;
  primary_color: string;
  light_logo_url: string | null;
  website_url: string | null;
}

export interface SliceData {
  dataUrl: string;
  index: number;
}

export interface SliceAnalysis {
  index: number;
  altText: string;
  suggestedLink: string;
  isClickable: boolean;
}

export interface Campaign {
  id: string;
  name: string;
  brand_id: string;
  status: string;
}

// Fetch all brands from the database
export async function fetchBrands(): Promise<Brand[]> {
  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/brands?select=id,name,domain,primary_color,light_logo_url,website_url&order=name`,
    {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      }
    }
  );

  if (!response.ok) {
    throw new Error('Failed to fetch brands');
  }

  return response.json();
}

// Upload image to Cloudinary via edge function
export async function uploadToCloudinary(base64Data: string, folder: string = 'campaigns'): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/upload-to-cloudinary`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      imageData: `data:image/png;base64,${base64Data}`,
      folder
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Upload failed: ${error}`);
  }

  const data = await response.json();
  return data.url;
}

// Analyze slices using AI
export async function analyzeSlices(
  slices: SliceData[], 
  brandUrl: string,
  brandDomain: string,
  fullCampaignImage?: string
): Promise<SliceAnalysis[]> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/analyze-slices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      slices,
      brandUrl,
      brandDomain,
      fullCampaignImage
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Analysis failed: ${error}`);
  }

  return response.json();
}

// Create a campaign in the database
export async function createCampaign(
  name: string,
  brandId: string,
  blocks: any[],
  generatedHtml: string,
  thumbnailUrl?: string,
  originalImageUrl?: string
): Promise<Campaign> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/campaigns`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      'Prefer': 'return=representation'
    },
    body: JSON.stringify({
      name,
      brand_id: brandId,
      blocks,
      generated_html: generatedHtml,
      thumbnail_url: thumbnailUrl,
      original_image_url: originalImageUrl,
      status: 'draft'
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create campaign: ${error}`);
  }

  const campaigns = await response.json();
  return campaigns[0];
}

// Generate HTML for a slice
export async function generateSliceHtml(
  sliceDataUrl: string,
  brandUrl: string,
  sliceIndex: number,
  totalSlices: number
): Promise<string> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/generate-slice-html`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({
      sliceDataUrl,
      brandUrl,
      sliceIndex,
      totalSlices
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HTML generation failed: ${error}`);
  }

  const data = await response.json();
  return data.html;
}
