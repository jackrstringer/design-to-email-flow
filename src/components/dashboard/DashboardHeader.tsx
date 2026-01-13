import { useNavigate } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type ViewMode = 'campaign' | 'brands' | 'queue';

interface DashboardHeaderProps {
  view: ViewMode;
  onViewChange: (view: ViewMode) => void;
}

export function DashboardHeader({ view, onViewChange }: DashboardHeaderProps) {
  const navigate = useNavigate();

  const handleViewChange = (newView: ViewMode) => {
    if (newView === 'queue') {
      navigate('/queue');
    } else {
      onViewChange(newView);
    }
  };

  return (
    <header className="border-b border-border/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-14 items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold tracking-tight">Campaign Studio</span>
            
            <nav className="flex items-center gap-1">
              <button
                onClick={() => handleViewChange('campaign')}
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
                onClick={() => handleViewChange('queue')}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                  view === 'queue'
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                Queue
              </button>
              <button
                onClick={() => handleViewChange('brands')}
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

          <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
