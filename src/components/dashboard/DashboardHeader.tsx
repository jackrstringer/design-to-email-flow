import { cn } from '@/lib/utils';

type ViewMode = 'campaign' | 'brands';

interface DashboardHeaderProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function DashboardHeader({ view, onViewChange }: DashboardHeaderProps) {
  return (
    <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold tracking-tight">Campaign Studio</span>
            
            <nav className="flex items-center gap-1">
              <button
                onClick={() => onViewChange('campaign')}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  view === 'campaign'
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                New Campaign
              </button>
              <button
                onClick={() => onViewChange('brands')}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  view === 'brands'
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                Brands
              </button>
            </nav>
          </div>
        </div>
      </div>
    </header>
  );
}
