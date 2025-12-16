import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import SimpleUpload from "./pages/SimpleUpload";
import Index from "./pages/Index";
import Brands from "./pages/Brands";
import BrandDetail from "./pages/BrandDetail";
import OverlayTest from "./pages/OverlayTest";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/upload" element={<SimpleUpload />} />
          <Route path="/legacy" element={<Index />} />
          <Route path="/brands" element={<Brands />} />
          <Route path="/brands/:id" element={<BrandDetail />} />
          <Route path="/test-overlay" element={<OverlayTest />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
