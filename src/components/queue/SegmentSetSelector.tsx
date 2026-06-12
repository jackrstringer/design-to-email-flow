import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Check, ChevronDown, Settings, Star, AlertTriangle, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SegmentPresetSegmentRef {
  id: string;
  name?: string;
}

export interface SegmentPreset {
  id: string;
  name: string;
  included_segments: Array<string | SegmentPresetSegmentRef>;
  excluded_segments: Array<string | SegmentPresetSegmentRef>;
  is_default: boolean;
  /** Optional user-chosen accent color — rendered as a small dot only. */
  color?: string | null;
}

interface SegmentSetSelectorProps {
  presets: SegmentPreset[];
  selectedPresetId: string | null;
  brandId: string | null;
  /** Live Klaviyo segment IDs available for this brand. Used to flag stale presets. */
  liveSegmentIds?: Set<string>;
  /** When true, live segments haven't loaded yet — don't flag anything. */
  liveSegmentsLoaded?: boolean;
  onSelect: (presetId: string) => void;
  disabled?: boolean;
}

function getSegmentId(seg: string | SegmentPresetSegmentRef): string {
  return typeof seg === 'string' ? seg : seg.id;
}

function getMissingCount(
  preset: SegmentPreset,
  liveSegmentIds?: Set<string>,
  loaded?: boolean
): number {
  if (!loaded || !liveSegmentIds) return 0;
  const all = [...preset.included_segments, ...preset.excluded_segments];
  return all.filter((s) => !liveSegmentIds.has(getSegmentId(s))).length;
}

export function SegmentSetSelector({
  presets,
  selectedPresetId,
  brandId,
  liveSegmentIds,
  liveSegmentsLoaded,
  onSelect,
  disabled = false,
}: SegmentSetSelectorProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedPreset = presets.find(p => p.id === selectedPresetId);
  const displayName = selectedPreset?.name || 'Select...';
  const selectedMissingCount = selectedPreset
    ? getMissingCount(selectedPreset, liveSegmentIds, liveSegmentsLoaded)
    : 0;

  const filteredPresets = useMemo(() => {
    if (!search.trim()) return presets;
    const q = search.toLowerCase();
    return presets.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      const segs = [...p.included_segments, ...p.excluded_segments];
      return segs.some((s) =>
        typeof s === 'object' && s.name ? s.name.toLowerCase().includes(q) : false
      );
    });
  }, [presets, search]);

  const handleManagePresets = () => {
    setOpen(false);
    if (brandId) {
      navigate(`/segments?brand=${brandId}`);
    }
  };

  if (!brandId || presets.length === 0) {
    return (
      <span className="text-muted-foreground/70 text-[12px]">—</span>
    );
  }

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setSearch(''); }}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "h-6 rounded-full bg-muted px-2.5 text-[11px] font-medium justify-between min-w-0 max-w-full gap-1 hover:bg-secondary",
            selectedPreset ? "text-foreground/75" : "text-muted-foreground/70",
            selectedMissingCount > 0 && "text-destructive hover:text-destructive",
            disabled && "opacity-50 pointer-events-none"
          )}
          disabled={disabled}
          title={
            selectedMissingCount > 0
              ? `${selectedMissingCount} segment(s) in this set no longer exist in Klaviyo. Fix before sending.`
              : undefined
          }
        >
          {selectedMissingCount > 0 && (
            <AlertTriangle className="h-3 w-3 flex-shrink-0 text-destructive" />
          )}
          {selectedPreset?.color && selectedMissingCount === 0 && (
            <span
              className="h-1.5 w-1.5 flex-shrink-0 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: selectedPreset.color }}
            />
          )}
          <span className="truncate">{displayName}</span>
          <ChevronDown className="h-3 w-3 ml-auto flex-shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1 bg-card" align="start">
        <div className="flex items-center gap-1.5 px-2 py-1 border-b border-border/60 mb-1">
          <Search className="h-3 w-3 text-muted-foreground/70 flex-shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search segments..."
            className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-muted-foreground/70"
            autoFocus
          />
        </div>
        <div className="max-h-[240px] overflow-y-auto">
          {filteredPresets.length === 0 ? (
            <div className="px-2 py-3 text-center text-[12px] text-muted-foreground/70">
              No matches
            </div>
          ) : (
            filteredPresets.map((preset) => {
              const missingCount = getMissingCount(preset, liveSegmentIds, liveSegmentsLoaded);
              return (
                <button
                  key={preset.id}
                  className={cn(
                    "w-full flex items-center gap-2 px-2 py-1.5 text-left text-[13px] rounded hover:bg-accent transition-colors",
                    selectedPresetId === preset.id && "bg-secondary/50"
                  )}
                  onClick={() => {
                    onSelect(preset.id);
                    setOpen(false);
                    setSearch('');
                  }}
                  title={
                    missingCount > 0
                      ? `${missingCount} segment(s) no longer exist in Klaviyo`
                      : undefined
                  }
                >
                  <div className="w-4 flex-shrink-0">
                    {selectedPresetId === preset.id && (
                      <Check className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                  {preset.color && (
                    <span
                      className="h-1.5 w-1.5 flex-shrink-0 rounded-full ring-1 ring-black/10"
                      style={{ backgroundColor: preset.color }}
                    />
                  )}
                  <span className={cn("truncate flex-1", missingCount > 0 && "text-destructive")}>
                    {preset.name}
                  </span>
                  {missingCount > 0 && (
                    <span className="flex items-center gap-0.5 text-destructive flex-shrink-0">
                      <AlertTriangle className="h-3 w-3" />
                      <span className="text-[10px] font-medium">{missingCount}</span>
                    </span>
                  )}
                  {preset.is_default && missingCount === 0 && (
                    <Star className="h-3 w-3 text-foreground fill-foreground flex-shrink-0" />
                  )}
                </button>
              );
            })
          )}
        </div>

        <div className="border-t border-border/60 mt-1 pt-1">
          <button
            className="w-full flex items-center gap-2 px-2 py-1.5 text-left text-[13px] text-muted-foreground rounded hover:bg-accent transition-colors"
            onClick={handleManagePresets}
          >
            <Settings className="h-3.5 w-3.5" />
            <span>Add/Edit Presets</span>
            <span className="ml-auto text-muted-foreground/70">→</span>
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
