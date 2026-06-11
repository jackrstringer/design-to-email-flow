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
          {/* Mobile-only floating trigger — desktop collapse lives in the sidebar */}
          <SidebarTrigger className="fixed left-3 top-3 z-40 h-8 w-8 rounded-lg border bg-background text-muted-foreground shadow-sm hover:text-foreground md:hidden" />
          {/* keyed by path so every navigation gets the page-in rise */}
          <div key={location.pathname} className="min-h-0 flex-1 overflow-auto animate-page-in">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
