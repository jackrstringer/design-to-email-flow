import { useState, useCallback } from 'react';
import { Upload, Key, CheckCircle, Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function SimpleUpload() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('klaviyo_api_key') || '');
  const [isDragActive, setIsDragActive] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [templateId, setTemplateId] = useState<string | null>(null);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem('klaviyo_api_key', key);
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  }, []);

  const processFile = async (file: File) => {
    if (!file.type.match(/^image\/(png|jpe?g)$/)) {
      toast.error('Please upload a PNG or JPG file');
      return;
    }

    if (!apiKey.trim()) {
      toast.error('Please enter your Klaviyo API key first');
      return;
    }

    setIsUploading(true);
    setStatus('Reading file...');
    setTemplateId(null);

    try {
      // Convert to base64
      const reader = new FileReader();
      const dataUrl = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Upload to Cloudinary
      setStatus('Uploading image to Cloudinary...');
      const { data: uploadData, error: uploadError } = await supabase.functions.invoke('upload-to-cloudinary', {
        body: { imageData: dataUrl, folder: 'klaviyo-templates' }
      });

      if (uploadError || !uploadData?.url) {
        throw new Error(uploadError?.message || 'Failed to upload image');
      }

      // Push to Klaviyo
      setStatus('Creating Klaviyo template...');
      const templateName = file.name.replace(/\.png$/i, '') || 'Email Template';
      
      const { data: klaviyoData, error: klaviyoError } = await supabase.functions.invoke('push-to-klaviyo', {
        body: {
          imageUrl: uploadData.url,
          templateName,
          klaviyoApiKey: apiKey.trim()
        }
      });

      if (klaviyoError || !klaviyoData?.templateId) {
        throw new Error(klaviyoData?.error || klaviyoError?.message || 'Failed to create Klaviyo template');
      }

      setTemplateId(klaviyoData.templateId);
      setStatus('Template created successfully!');
      toast.success('Template pushed to Klaviyo!');

    } catch (error) {
      console.error('Upload error:', error);
      setStatus('');
      toast.error(error instanceof Error ? error.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  }, [apiKey]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  };

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="max-w-xl mx-auto space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-foreground">PNG → Klaviyo</h1>
          <p className="text-muted-foreground mt-2">Upload a PNG or JPG and push it directly to Klaviyo as an editable template</p>
        </div>

        {/* API Key Section */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Key className="w-4 h-4" />
            Klaviyo Private API Key
          </label>
          <Input
            type="password"
            placeholder="pk_xxxxxxxxxxxx"
            value={apiKey}
            onChange={(e) => saveApiKey(e.target.value)}
            className="font-mono"
          />
          <p className="text-xs text-muted-foreground">
            Your key is saved locally and never stored on our servers
          </p>
        </div>

        {/* Drop Zone */}
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          className={cn(
            'relative flex flex-col items-center justify-center',
            'h-64 border-2 border-dashed rounded-xl transition-all duration-200',
            'cursor-pointer hover:border-primary/50 hover:bg-muted/50',
            isDragActive ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border',
            isUploading && 'pointer-events-none opacity-60'
          )}
        >
          <input
            type="file"
            accept=".png,.jpg,.jpeg"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isUploading}
          />
          
          <div className="flex flex-col items-center gap-4 p-8 text-center">
            {isUploading ? (
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
            ) : (
              <div className={cn(
                'p-4 rounded-full transition-colors',
                isDragActive ? 'bg-primary/10' : 'bg-muted'
              )}>
                <Upload className={cn(
                  'w-8 h-8 transition-colors',
                  isDragActive ? 'text-primary' : 'text-muted-foreground'
                )} />
              </div>
            )}
            
            <div>
              <p className="text-lg font-medium text-foreground">
                {isUploading ? status : 'Drop your PNG here'}
              </p>
              {!isUploading && (
                <p className="mt-1 text-sm text-muted-foreground">
                  or click to browse
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Success State */}
        {templateId && (
          <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle className="w-5 h-5" />
              <span className="font-medium">Template created successfully!</span>
            </div>
            <p className="text-sm text-muted-foreground">
              <strong>Important:</strong> To edit this template with drag-and-drop, you must use it in a <strong>Campaign</strong> or <strong>Flow</strong>. 
              Opening it directly from Templates will show the code editor.
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => window.open(`https://www.klaviyo.com/email-templates/${templateId}`, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" />
                View Template
              </Button>
              <Button
                variant="default"
                className="flex-1"
                onClick={() => window.open('https://www.klaviyo.com/campaigns/create', '_blank')}
              >
                Create Campaign
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
