import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthGuard } from "./components/AuthGuard";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import SimpleUpload from "./pages/SimpleUpload";
import Index from "./pages/Index";
import Brands from "./pages/Brands";
import BrandDetail from "./pages/BrandDetail";
import OverlayTest from "./pages/OverlayTest";
import CampaignPage from "./pages/CampaignPage";
import CampaignSend from "./pages/CampaignSend";
import CampaignQueue from "./pages/CampaignQueue";
import FooterEditor from "./pages/FooterEditor";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          {/* Public routes */}
          <Route path="/auth" element={<Auth />} />
          
          {/* Protected routes */}
          <Route path="/" element={<AuthGuard><Dashboard /></AuthGuard>} />
          <Route path="/queue" element={<AuthGuard><CampaignQueue /></AuthGuard>} />
          <Route path="/upload" element={<AuthGuard><SimpleUpload /></AuthGuard>} />
          <Route path="/legacy" element={<AuthGuard><Index /></AuthGuard>} />
          <Route path="/brands" element={<AuthGuard><Brands /></AuthGuard>} />
          <Route path="/brands/:id" element={<AuthGuard><BrandDetail /></AuthGuard>} />
          <Route path="/campaign/:id" element={<AuthGuard><CampaignPage /></AuthGuard>} />
          <Route path="/campaign/:id/send" element={<AuthGuard><CampaignSend /></AuthGuard>} />
          <Route path="/footer-editor/:brandId" element={<AuthGuard><FooterEditor /></AuthGuard>} />
          <Route path="/test-overlay" element={<OverlayTest />} />
          
          {/* Catch-all */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
