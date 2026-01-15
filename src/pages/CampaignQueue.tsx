import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Building } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { QueueTable } from '@/components/queue/QueueTable';
import { useCampaignQueue } from '@/hooks/useCampaignQueue';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface Brand {
  id: string;
  name: string;
}

export default function CampaignQueue() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { items, loading, refresh, presetsByBrand } = useCampaignQueue();
  
  const [brandFilter, setBrandFilter] = useState<string>('all');
  const [brands, setBrands] = useState<Brand[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch brands for filter dropdown
  useEffect(() => {
    async function fetchBrands() {
      if (!user) return;
      const { data } = await supabase
        .from('brands')
        .select('id, name')
        .order('name');
      if (data) setBrands(data);
    }
    fetchBrands();
  }, [user]);

  const filteredItems = items.filter(item => {
    const matchesBrand = brandFilter === 'all' || item.brand_id === brandFilter;
    return matchesBrand;
  });

  const handleToggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header - Simplified Airtable style */}
      <header className="border-b border-gray-200 bg-white sticky top-0 z-50">
        <div className="px-4">
          <div className="flex h-12 items-center justify-between">
            {/* Left: Back + Title */}
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-gray-500 hover:text-gray-900"
                onClick={() => navigate('/')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium text-gray-900">Campaign Queue</span>
            </div>
            
            {/* Right: Brand Filter + Refresh */}
            <div className="flex items-center gap-2">
              <Select value={brandFilter} onValueChange={setBrandFilter}>
                <SelectTrigger className="h-8 w-36 text-[13px] border-gray-200 bg-white">
                  <Building className="h-3.5 w-3.5 mr-1.5 text-gray-400" />
                  <SelectValue placeholder="All Brands" />
                </SelectTrigger>
                <SelectContent className="bg-white">
                  <SelectItem value="all">All Brands</SelectItem>
                  {brands.map(brand => (
                    <SelectItem key={brand.id} value={brand.id}>{brand.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-8 w-8 text-gray-500 hover:text-gray-900"
                onClick={refresh}
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="px-4 py-4">
        <div className="max-w-[85%] mx-auto">
          <QueueTable
            items={filteredItems}
            loading={loading}
            expandedId={expandedId}
            onToggleExpand={handleToggleExpand}
            onUpdate={refresh}
            presetsByBrand={presetsByBrand}
          />
        </div>
      </main>
    </div>
  );
}
