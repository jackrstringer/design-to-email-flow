import { useState, useEffect } from 'react';
import { Module, MODULE_TYPES, MODULE_TYPE_LABELS, ModuleType } from '@/types/modules';
import { ModuleCard } from './ModuleCard';
import { ModuleDetailModal } from './ModuleDetailModal';
import { useModules } from '@/hooks/useModules';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, Filter, LayoutGrid } from 'lucide-react';

interface ModulesGridProps {
  brandId: string;
}

export function ModulesGrid({ brandId }: ModulesGridProps) {
  const [modules, setModules] = useState<Module[]>([]);
  const [filteredModules, setFilteredModules] = useState<Module[]>([]);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  const { getModulesByBrandId, updateModule } = useModules();
  
  const fetchModules = async () => {
    setIsLoading(true);
    const data = await getModulesByBrandId(brandId);
    setModules(data);
    setIsLoading(false);
  };
  
  useEffect(() => {
    fetchModules();
  }, [brandId]);
  
  // Apply filters
  useEffect(() => {
    let filtered = [...modules];
    
    if (typeFilter !== 'all') {
      filtered = filtered.filter(m => m.module_type === typeFilter);
    }
    
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(m => 
        m.content?.headline?.toLowerCase().includes(query) ||
        m.content?.subheadline?.toLowerCase().includes(query) ||
        m.content?.cta_text?.toLowerCase().includes(query) ||
        m.composition_notes?.toLowerCase().includes(query)
      );
    }
    
    setFilteredModules(filtered);
  }, [modules, typeFilter, searchQuery]);
  
  const handleModuleClick = (module: Module) => {
    setSelectedModule(module);
  };
  
  const handleSaveModule = async (moduleId: string, updates: Partial<Module>) => {
    await updateModule(moduleId, updates);
    await fetchModules();
  };
  
  // Count modules by type
  const typeCounts = modules.reduce((acc, m) => {
    acc[m.module_type] = (acc[m.module_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const referenceCount = modules.filter(m => m.is_reference_quality).length;
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (modules.length === 0) {
    return (
      <div className="text-center py-12">
        <LayoutGrid className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
        <h3 className="text-lg font-medium text-muted-foreground">No modules yet</h3>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Import campaigns to start building your module library
        </p>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        <Badge variant="outline" className="text-sm">
          {modules.length} modules
        </Badge>
        {referenceCount > 0 && (
          <Badge className="bg-yellow-500/20 text-yellow-700 border-yellow-500/30">
            {referenceCount} reference quality
          </Badge>
        )}
      </div>
      
      {/* Filters */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search modules..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types ({modules.length})</SelectItem>
              {MODULE_TYPES.filter(type => typeCounts[type]).map(type => (
                <SelectItem key={type} value={type}>
                  {MODULE_TYPE_LABELS[type]} ({typeCounts[type]})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Grid */}
      {filteredModules.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-muted-foreground">No modules match your filters</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredModules.map(module => (
            <ModuleCard
              key={module.id}
              module={module}
              onClick={handleModuleClick}
            />
          ))}
        </div>
      )}
      
      {/* Detail Modal */}
      <ModuleDetailModal
        module={selectedModule}
        isOpen={!!selectedModule}
        onClose={() => setSelectedModule(null)}
        onSave={handleSaveModule}
      />
    </div>
  );
}
