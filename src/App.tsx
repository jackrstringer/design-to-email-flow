import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthGuard } from "./components/AuthGuard";
import { AppLayout } from "./layouts/AppLayout";
import Auth from "./pages/Auth";
import SimpleUpload from "./pages/SimpleUpload";
import Index from "./pages/Index";
import Brands from "./pages/Brands";
import BrandDetail from "./pages/BrandDetail";
import OverlayTest from "./pages/OverlayTest";
import CampaignPage from "./pages/CampaignPage";
import CampaignSend from "./pages/CampaignSend";
import CampaignQueue from "./pages/CampaignQueue";
import Segments from "./pages/Segments";
import Settings from "./pages/Settings";
import FooterEditor from "./pages/FooterEditor";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes before data is considered stale
      gcTime: 1000 * 60 * 30, // Keep in cache for 30 minutes
      refetchOnWindowFocus: false, // Don't refetch when window regains focus
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/auth" element={<Auth />} />
          
          {/* Protected routes with sidebar layout */}
          <Route path="/" element={<Navigate to="/queue" replace />} />
          <Route path="/queue" element={<AuthGuard><AppLayout><CampaignQueue /></AppLayout></AuthGuard>} />
          <Route path="/brands" element={<AuthGuard><AppLayout><Brands /></AppLayout></AuthGuard>} />
          <Route path="/brands/:id" element={<AuthGuard><AppLayout><BrandDetail /></AppLayout></AuthGuard>} />
          <Route path="/segments" element={<AuthGuard><AppLayout><Segments /></AppLayout></AuthGuard>} />
          <Route path="/upload" element={<AuthGuard><AppLayout><SimpleUpload /></AppLayout></AuthGuard>} />
          <Route path="/settings" element={<AuthGuard><AppLayout><Settings /></AppLayout></AuthGuard>} />
          
          {/* Routes without sidebar (full-screen views) */}
          <Route path="/campaign/:id" element={<AuthGuard><CampaignPage /></AuthGuard>} />
          <Route path="/campaign/:id/send" element={<AuthGuard><CampaignSend /></AuthGuard>} />
          <Route path="/footer-editor/:brandId" element={<AuthGuard><FooterEditor /></AuthGuard>} />
          <Route path="/legacy" element={<AuthGuard><Index /></AuthGuard>} />
          <Route path="/test-overlay" element={<OverlayTest />} />
          
          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
