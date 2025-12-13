import { useCallback, useState } from 'react';
import { Upload, Image, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadZoneProps {
  onFileUpload: (file: File, dataUrl: string) => void;
  isLoading?: boolean;
}

export const UploadZone = ({ onFileUpload, isLoading }: UploadZoneProps) => {
  const [isDragActive, setIsDragActive] = useState(false);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  }, []);

  const processFile = useCallback((file: File) => {
    if (!file.type.match(/^image\/(png|jpeg|jpg)$/) && file.type !== 'application/pdf') {
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      onFileUpload(file, dataUrl);
    };
    reader.readAsDataURL(file);
  }, [onFileUpload]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    const files = e.dataTransfer.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  }, [processFile]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files[0]) {
      processFile(files[0]);
    }
  }, [processFile]);

  return (
    <div
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={cn(
        'relative flex flex-col items-center justify-center w-full max-w-2xl mx-auto',
        'h-80 border-2 border-dashed rounded-xl transition-all duration-200',
        'cursor-pointer hover:border-primary/50 hover:bg-muted/50',
        isDragActive ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-border',
        isLoading && 'pointer-events-none opacity-60'
      )}
    >
      <input
        type="file"
        accept=".png,.jpg,.jpeg,.pdf"
        onChange={handleChange}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isLoading}
      />
      
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <div className={cn(
          'p-4 rounded-full transition-colors',
          isDragActive ? 'bg-primary/10' : 'bg-muted'
        )}>
          <Upload className={cn(
            'w-8 h-8 transition-colors',
            isDragActive ? 'text-primary' : 'text-muted-foreground'
          )} />
        </div>
        
        <div>
          <p className="text-lg font-medium text-foreground">
            {isLoading ? 'Analyzing design...' : 'Drop your email design here'}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            or click to browse
          </p>
        </div>
        
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Image className="w-3.5 h-3.5" />
            PNG, JPG
          </span>
          <span className="flex items-center gap-1">
            <FileText className="w-3.5 h-3.5" />
            PDF
          </span>
        </div>
      </div>
    </div>
  );
};
