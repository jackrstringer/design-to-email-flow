import { useState } from 'react';
import { ChevronDown, Plus, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface SubjectLineSelectorProps {
  label: string;
  selected: string | null;
  provided: string | null;
  generated: string[] | null;
  onSelect: (value: string) => void;
}

export function SubjectLineSelector({
  label,
  selected,
  provided,
  generated,
  onSelect,
}: SubjectLineSelectorProps) {
  const [open, setOpen] = useState(false);
  const [customValue, setCustomValue] = useState('');

  const options = [
    ...(provided ? [{ value: provided, source: 'provided' as const }] : []),
    ...(generated || []).map(value => ({ value, source: 'generated' as const })),
  ];

  const handleSelect = (value: string) => {
    onSelect(value);
    setOpen(false);
  };

  const handleCustomSubmit = () => {
    if (customValue.trim()) {
      onSelect(customValue.trim());
      setCustomValue('');
      setOpen(false);
    }
  };

  return (
    <div>
      <h3 className="text-sm font-medium mb-2">{label}</h3>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            className="w-full justify-between text-left font-normal h-auto py-2"
          >
            <span className={cn("truncate", !selected && "text-muted-foreground")}>
              {selected ? `"${selected}"` : `Select ${label.toLowerCase()}`}
            </span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <div className="p-2 max-h-[300px] overflow-y-auto">
            {options.length === 0 ? (
              <p className="text-sm text-muted-foreground p-2">
                No options available
              </p>
            ) : (
              <div className="space-y-1">
                {options.map((option, index) => (
                  <button
                    key={index}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded text-sm hover:bg-muted flex items-start gap-2",
                      selected === option.value && "bg-muted"
                    )}
                    onClick={() => handleSelect(option.value)}
                  >
                    <span className="mt-0.5 w-4 shrink-0">
                      {selected === option.value && <Check className="h-4 w-4" />}
                    </span>
                    <span>"{option.value}"</span>
                    {option.source === 'provided' && (
                      <span className="text-xs text-muted-foreground ml-auto shrink-0">
                        from source
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="border-t p-2">
            <p className="text-xs text-muted-foreground mb-2">Or write custom:</p>
            <div className="flex gap-2">
              <Input
                placeholder={`Enter custom ${label.toLowerCase()}`}
                value={customValue}
                onChange={(e) => setCustomValue(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
                className="h-8 text-sm"
              />
              <Button size="sm" onClick={handleCustomSubmit} disabled={!customValue.trim()}>
                Apply
              </Button>
            </div>
          </div>

          <div className="border-t p-2">
            <Button variant="ghost" size="sm" className="w-full">
              <Plus className="h-4 w-4 mr-1" />
              Generate More
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
