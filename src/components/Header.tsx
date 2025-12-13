import { Button } from '@/components/ui/button';
import { Mail } from 'lucide-react';

export const Header = () => {
  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-border bg-card">
      <div className="flex items-center gap-2">
        <div className="p-2 bg-primary rounded-lg">
          <Mail className="w-5 h-5 text-primary-foreground" />
        </div>
        <span className="text-lg font-semibold text-foreground">Email Converter</span>
      </div>
      
      <Button variant="outline" size="sm" disabled>
        Connect Klaviyo
      </Button>
    </header>
  );
};
