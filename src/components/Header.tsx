import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Send, Settings } from 'lucide-react';
import { cn } from '@/lib/utils';

interface HeaderProps {
  onOpenSettings?: () => void;
}

export const Header = ({ onOpenSettings }: HeaderProps) => {
  const location = useLocation();
  
  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-primary rounded-lg">
          <Send className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold text-foreground">Sendr</span>
      </div>
      
      <div className="flex items-center">
        <div className="flex items-center bg-muted rounded-full p-1">
          <Link to="/brands">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-full px-4 transition-all",
                isActive('/brands') 
                  ? "bg-card text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-transparent"
              )}
            >
              My Brands
            </Button>
          </Link>
          <Link to="/">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                "rounded-full px-4 transition-all",
                isActive('/') 
                  ? "bg-card text-foreground shadow-sm" 
                  : "text-muted-foreground hover:text-foreground hover:bg-transparent"
              )}
            >
              New Campaign
            </Button>
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {onOpenSettings && (
          <Button variant="ghost" size="icon" onClick={onOpenSettings}>
            <Settings className="w-4 h-4" />
          </Button>
        )}
      </div>
    </header>
  );
};
