import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { AuthProvider } from "./contexts/AuthContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { AuthGuard } from "./components/AuthGuard";
import { AppLayout } from "./layouts/AppLayout";

// Route-level code splitting: each page loads on demand.
const Auth = lazy(() => import("./pages/Auth"));
const SimpleUpload = lazy(() => import("./pages/SimpleUpload"));
const Brands = lazy(() => import("./pages/Brands"));
const BrandLayout = lazy(() => import("./layouts/BrandLayout").then((m) => ({ default: m.BrandLayout })));
const BrandOverview = lazy(() => import("./pages/BrandOverview"));
const BrandKnowledge = lazy(() => import("./pages/BrandKnowledge"));
const BrandLinks = lazy(() => import("./pages/BrandLinks"));
const BrandEmail = lazy(() => import("./pages/BrandEmail"));
const BrandIntegrations = lazy(() => import("./pages/BrandIntegrations"));
const CampaignPage = lazy(() => import("./pages/CampaignPage"));
const CampaignSend = lazy(() => import("./pages/CampaignSend"));
const CampaignQueue = lazy(() => import("./pages/CampaignQueue"));
const Segments = lazy(() => import("./pages/Segments"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const FooterEditor = lazy(() => import("./pages/FooterEditor"));
const ImageFooterStudio = lazy(() => import("./pages/ImageFooterStudio"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));
const NotFound = lazy(() => import("./pages/NotFound"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 30,
      refetchOnWindowFocus: false,
    },
  },
});

const PageFallback = () => (
  <div className="p-8 space-y-4">
    <Skeleton className="h-8 w-48" />
    <Skeleton className="h-32 w-full" />
    <Skeleton className="h-32 w-full" />
  </div>
);

const App = () => (
  <ErrorBoundary>
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Suspense fallback={<PageFallback />}>
            <Routes>
              {/* Public routes */}
              <Route path="/auth" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />

              {/* Protected routes share ONE persistent shell — the sidebar
                  never unmounts between pages, so navigation is instant with
                  no skeleton flash. */}
              <Route path="/" element={<Navigate to="/queue" replace />} />
              <Route element={<AuthGuard><AppLayout><Outlet /></AppLayout></AuthGuard>}>
                <Route path="/queue" element={<CampaignQueue />} />
                <Route path="/brands" element={<Brands />} />
                <Route path="/brands/:id" element={<BrandLayout />}>
                  <Route index element={<BrandOverview />} />
                  <Route path="knowledge" element={<BrandKnowledge />} />
                  <Route path="links" element={<BrandLinks />} />
                  <Route path="email" element={<BrandEmail />} />
                  <Route path="integrations" element={<BrandIntegrations />} />
                </Route>
                <Route path="/segments" element={<Segments />} />
                <Route path="/analytics" element={<Analytics />} />
                <Route path="/upload" element={<SimpleUpload />} />
                <Route path="/settings" element={<Settings />} />
              </Route>

              {/* Focused full-screen flows (each carries a breadcrumb back) */}
              <Route path="/campaign/:id" element={<AuthGuard><CampaignPage /></AuthGuard>} />
              <Route path="/campaign/:id/send" element={<AuthGuard><CampaignSend /></AuthGuard>} />
              <Route path="/footer-editor/:brandId" element={<AuthGuard><FooterEditor /></AuthGuard>} />
              <Route path="/footer-studio/:brandId/:jobId" element={<AuthGuard><ImageFooterStudio /></AuthGuard>} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
