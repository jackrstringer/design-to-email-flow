import { Module, MODULE_TYPE_LABELS, ModuleType } from '@/types/modules';
import { Badge } from '@/components/ui/badge';
import { Star } from 'lucide-react';

interface ModuleCardProps {
  module: Module;
  onClick: (module: Module) => void;
}

export function ModuleCard({ module, onClick }: ModuleCardProps) {
  const typeLabel = MODULE_TYPE_LABELS[module.module_type as ModuleType] || module.module_type.replace(/_/g, ' ');
  const qualityPercent = Math.round(module.quality_score * 100);
  
  return (
    <div 
      className="group cursor-pointer rounded-lg border border-border bg-card overflow-hidden transition-all hover:shadow-lg hover:border-primary/50"
      onClick={() => onClick(module)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[4/3] bg-muted overflow-hidden">
        <img
          src={module.thumbnail_url || module.image_url}
          alt={`${typeLabel} module`}
          className="w-full h-full object-cover object-top transition-transform group-hover:scale-105"
          loading="lazy"
        />
        
        {/* Reference quality badge */}
        {module.is_reference_quality && (
          <div className="absolute top-2 right-2">
            <Badge className="bg-yellow-500/90 text-yellow-950 text-xs gap-1">
              <Star className="h-3 w-3 fill-current" />
              Reference
            </Badge>
          </div>
        )}
      </div>
      
      {/* Info */}
      <div className="p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Badge variant="secondary" className="text-xs truncate">
            {typeLabel}
          </Badge>
          
          <span className={`text-xs font-medium ${qualityPercent >= 80 ? 'text-green-600' : qualityPercent >= 60 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
            {qualityPercent}%
          </span>
        </div>
        
        {/* Content preview */}
        {module.content?.headline && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {module.content.headline}
          </p>
        )}
        
        {/* Dimensions */}
        <p className="text-xs text-muted-foreground/60">
          {module.width} × {module.height}px
        </p>
      </div>
    </div>
  );
}
