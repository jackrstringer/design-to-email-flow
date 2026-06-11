import { useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger className="h-8 w-8 text-muted-foreground hover:text-foreground" />
          </header>
          {/* keyed by path so every navigation gets the page-in rise */}
          <div key={location.pathname} className="min-h-0 flex-1 overflow-auto animate-page-in">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
