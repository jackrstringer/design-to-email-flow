import { Suspense, useEffect } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  // Warm every main page chunk while the browser is idle — first navigation
  // to any tab is then instant instead of a lazy-chunk round trip.
  useEffect(() => {
    const warm = () => {
      import("@/pages/CampaignQueue");
      import("@/pages/Brands");
      import("@/pages/Segments");
      import("@/pages/Analytics");
      import("@/pages/Settings");
      import("@/pages/SimpleUpload");
    };
    const idle = (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 400));
    idle(warm);
  }, []);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background">
        <AppSidebar />
        <main className="flex min-w-0 flex-1 flex-col">
          {/* Mobile-only floating trigger — desktop collapse lives on the rail edge */}
          <SidebarTrigger className="fixed left-3 top-3 z-40 h-8 w-8 rounded-lg border bg-background text-muted-foreground shadow-sm hover:text-foreground md:hidden" />
          {/* No remount fade — switching pages must feel instant, not animated. */}
          <div className="min-h-0 flex-1 overflow-auto">
            <Suspense fallback={null}>{children}</Suspense>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
