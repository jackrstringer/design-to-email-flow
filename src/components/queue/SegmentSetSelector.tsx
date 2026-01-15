import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Check, ChevronDown, Settings, Star } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SegmentPreset {
  id: string;
  name: string;
  included_segments: string[];
  excluded_segments: string[];
  is_default: boolean;
}

interface SegmentSetSelectorProps {
  presets: SegmentPreset[];
  selectedPresetId: string | null;
  brandId: string | null;
  onSelect: (presetId: string) => void;
  disabled?: boolean;
}

export function SegmentSetSelector({
  presets,
  selectedPresetId,
  brandId,
  onSelect,
  disabled = false,
}: SegmentSetSelectorProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const selectedPreset = presets.find(p => p.id === selectedPresetId);
  const displayName = selectedPreset?.name || 'Select...';

  const handleManagePresets = () => {
    setOpen(false);
    if (brandId) {
      navigate(`/brands/${brandId}#audience`);
    }
  };

  if (!brandId || presets.length === 0) {
    return (
      <span className="text-gray-400 text-[12px]">—</span>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-6 px-2 text-[12px] font-normal justify-between min-w-0 max-w-full",
            selectedPreset ? "text-gray-700" : "text-gray-400",
            disabled && "opacity-50 pointer-events-none"
          )}
          disabled={disabled}
        >
          <span className="truncate">{displayName}</span>
          <ChevronDown className="h-3 w-3 ml-1 flex-shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1 bg-white" align="start">
        <div className="max-h-[200px] overflow-y-auto">
          {presets.map((preset) => (
            <button
              key={preset.id}
              className={cn(
                "w-full flex items-center gap-2 px-2 py-1.5 text-left text-[13px] rounded hover:bg-gray-100 transition-colors",
                selectedPresetId === preset.id && "bg-gray-50"
              )}
              onClick={() => {
                onSelect(preset.id);
                setOpen(false);
              }}
            >
              <div className="w-4 flex-shrink-0">
                {selectedPresetId === preset.id && (
                  <Check className="h-3.5 w-3.5 text-blue-600" />
                )}
              </div>
              <span className="truncate flex-1">{preset.name}</span>
              {preset.is_default && (
                <Star className="h-3 w-3 text-amber-500 fill-amber-500 flex-shrink-0" />
              )}
            </button>
          ))}
        </div>
        
        <div className="border-t border-gray-100 mt-1 pt-1">
          <button
            className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-[13px] text-gray-600 rounded hover:bg-gray-100 transition-colors"
            onClick={handleManagePresets}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Add/Edit Presets</span>
            <span className="ml-auto text-gray-400">→</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}