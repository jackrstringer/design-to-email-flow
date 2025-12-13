import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Check, Upload } from 'lucide-react';
import type { SocialIconAsset, SocialLink } from '@/types/brand-assets';

interface SocialIconUploaderProps {
  platforms: SocialLink['platform'][];
  icons: SocialIconAsset[];
  onChange: (icons: SocialIconAsset[]) => void;
}

const platformLabels: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  twitter: 'X/Twitter',
  linkedin: 'LinkedIn',
  youtube: 'YouTube',
  tiktok: 'TikTok',
};

export const SocialIconUploader = ({
  platforms,
  icons,
  onChange,
}: SocialIconUploaderProps) => {
  const handleFileUpload = useCallback(
    (platform: SocialLink['platform'], variant: 'white' | 'black', file: File) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const existingIndex = icons.findIndex(i => i.platform === platform);
        
        const updatedIcon: SocialIconAsset = existingIndex >= 0
          ? { ...icons[existingIndex] }
          : { platform };

        if (variant === 'white') {
          updatedIcon.whiteUrl = dataUrl;
          updatedIcon.whitePublicId = `social-${platform}-white-${Date.now()}`;
        } else {
          updatedIcon.blackUrl = dataUrl;
          updatedIcon.blackPublicId = `social-${platform}-black-${Date.now()}`;
        }

        if (existingIndex >= 0) {
          const newIcons = [...icons];
          newIcons[existingIndex] = updatedIcon;
          onChange(newIcons);
        } else {
          onChange([...icons, updatedIcon]);
        }
      };
      reader.readAsDataURL(file);
    },
    [icons, onChange]
  );

  const getIconData = (platform: SocialLink['platform']) => {
    return icons.find(i => i.platform === platform);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {platforms.map((platform) => {
        const iconData = getIconData(platform);
        const hasWhite = !!iconData?.whiteUrl;
        const hasBlack = !!iconData?.blackUrl;

        return (
          <div key={platform} className="p-4 rounded-lg border bg-card">
            <p className="text-sm font-medium mb-3">{platformLabels[platform]}</p>
            
            <div className="grid grid-cols-2 gap-2">
              {/* White icon upload */}
              <IconUploadSlot
                label="White"
                previewUrl={iconData?.whiteUrl}
                isUploaded={hasWhite}
                bgClass="bg-gray-800"
                onUpload={(file) => handleFileUpload(platform, 'white', file)}
              />
              
              {/* Black icon upload */}
              <IconUploadSlot
                label="Black"
                previewUrl={iconData?.blackUrl}
                isUploaded={hasBlack}
                bgClass="bg-gray-100"
                onUpload={(file) => handleFileUpload(platform, 'black', file)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

interface IconUploadSlotProps {
  label: string;
  previewUrl?: string;
  isUploaded: boolean;
  bgClass: string;
  onUpload: (file: File) => void;
}

const IconUploadSlot = ({
  label,
  previewUrl,
  isUploaded,
  bgClass,
  onUpload,
}: IconUploadSlotProps) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload(file);
    }
  };

  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <label
        className={cn(
          'relative flex items-center justify-center w-full aspect-square rounded cursor-pointer',
          'border-2 border-dashed transition-colors',
          isUploaded ? 'border-green-500' : 'border-muted-foreground/30 hover:border-muted-foreground/50',
          bgClass
        )}
      >
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={handleChange}
        />
        {previewUrl ? (
          <>
            <img
              src={previewUrl}
              alt={`${label} icon`}
              className="w-6 h-6 object-contain"
            />
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center">
              <Check className="w-2.5 h-2.5 text-white" />
            </div>
          </>
        ) : (
          <Upload className="w-4 h-4 text-muted-foreground" />
        )}
      </label>
    </div>
  );
};
