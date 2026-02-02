import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Module, MODULE_TYPES, MODULE_TYPE_LABELS, ModuleType } from '@/types/modules';
import { Star, Palette, Type, Layout, FileText, Sparkles } from 'lucide-react';

interface ModuleDetailModalProps {
  module: Module | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (moduleId: string, updates: Partial<Module>) => Promise<void>;
}

export function ModuleDetailModal({ module, isOpen, onClose, onSave }: ModuleDetailModalProps) {
  const [moduleType, setModuleType] = useState(module?.module_type || '');
  const [isSaving, setIsSaving] = useState(false);
  
  useEffect(() => {
    if (module) {
      setModuleType(module.module_type);
    }
  }, [module]);
  
  if (!module) return null;
  
  const handleSave = async () => {
    if (moduleType === module.module_type) {
      onClose();
      return;
    }
    
    setIsSaving(true);
    await onSave(module.id, { module_type: moduleType });
    setIsSaving(false);
    onClose();
  };
  
  const qualityPercent = Math.round(module.quality_score * 100);
  const typeLabel = MODULE_TYPE_LABELS[module.module_type as ModuleType] || module.module_type;
  
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="flex items-center gap-3">
            <span>Module {module.module_index + 1}</span>
            <Badge variant="outline">{typeLabel}</Badge>
            {module.is_reference_quality && (
              <Badge className="bg-yellow-500/90 text-yellow-950 gap-1">
                <Star className="h-3 w-3 fill-current" />
                Reference Quality
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 pt-4">
          {/* Left: Module Image */}
          <div className="space-y-3">
            <div className="rounded-lg border border-border overflow-hidden bg-muted">
              <img
                src={module.image_url}
                alt={`${typeLabel} module`}
                className="w-full h-auto"
              />
            </div>
            
            <p className="text-sm text-muted-foreground text-center">
              {module.width} × {module.height}px
            </p>
          </div>
          
          {/* Right: Module Details */}
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-6 pr-4">
              {/* Classification */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Layout className="h-4 w-4" />
                  Module Type
                </label>
                <Select value={moduleType} onValueChange={setModuleType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {MODULE_TYPES.map(type => (
                      <SelectItem key={type} value={type}>
                        {MODULE_TYPE_LABELS[type]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <Separator />
              
              {/* Extracted Content */}
              {module.content && Object.keys(module.content).length > 0 && (
                <div className="space-y-3">
                  <h4 className="text-sm font-medium flex items-center gap-2">
                    <Type className="h-4 w-4" />
                    Extracted Content
                  </h4>
                  
                  <div className="space-y-2 text-sm">
                    {module.content.headline && (
                      <div className="p-2 bg-muted rounded">
                        <span className="text-muted-foreground">Headline: </span>
                        <span className="font-medium">{module.content.headline}</span>
                      </div>
                    )}
                    {module.content.subheadline && (
                      <div className="p-2 bg-muted rounded">
                        <span className="text-muted-foreground">Subheadline: </span>
                        <span>{module.content.subheadline}</span>
                      </div>
                    )}
                    {module.content.body_copy && (
                      <div className="p-2 bg-muted rounded">
                        <span className="text-muted-foreground">Body: </span>
                        <span>{module.content.body_copy}</span>
                      </div>
                    )}
                    {module.content.cta_text && (
                      <div className="p-2 bg-muted rounded">
                        <span className="text-muted-foreground">CTA: </span>
                        <Badge variant="secondary">{module.content.cta_text}</Badge>
                      </div>
                    )}
                    {module.content.bullet_points && module.content.bullet_points.length > 0 && (
                      <div className="p-2 bg-muted rounded">
                        <span className="text-muted-foreground">Bullets:</span>
                        <ul className="list-disc list-inside mt-1 space-y-1">
                          {module.content.bullet_points.map((bp, i) => (
                            <li key={i}>{bp}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* Visual Analysis */}
              {module.visuals && Object.keys(module.visuals).length > 0 && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <Palette className="h-4 w-4" />
                      Visual Analysis
                    </h4>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      {module.visuals.background_color && (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded">
                          <div 
                            className="w-4 h-4 rounded border border-border" 
                            style={{ backgroundColor: module.visuals.background_color }}
                          />
                          <span className="text-muted-foreground">Background</span>
                        </div>
                      )}
                      {module.visuals.text_color_primary && (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded">
                          <div 
                            className="w-4 h-4 rounded border border-border" 
                            style={{ backgroundColor: module.visuals.text_color_primary }}
                          />
                          <span className="text-muted-foreground">Text</span>
                        </div>
                      )}
                      {module.visuals.accent_color && (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded">
                          <div 
                            className="w-4 h-4 rounded border border-border" 
                            style={{ backgroundColor: module.visuals.accent_color }}
                          />
                          <span className="text-muted-foreground">Accent</span>
                        </div>
                      )}
                      {module.visuals.cta_style?.fill_color && (
                        <div className="flex items-center gap-2 p-2 bg-muted rounded">
                          <div 
                            className="w-4 h-4 rounded border border-border" 
                            style={{ backgroundColor: module.visuals.cta_style.fill_color }}
                          />
                          <span className="text-muted-foreground">CTA</span>
                        </div>
                      )}
                    </div>
                    
                    {module.visuals.image_type && (
                      <p className="text-sm text-muted-foreground">
                        Image: {module.visuals.image_type} ({module.visuals.image_position})
                      </p>
                    )}
                  </div>
                </>
              )}
              
              {/* Composition Notes */}
              {module.composition_notes && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <h4 className="text-sm font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Composition Notes
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed p-3 bg-muted rounded-lg">
                      {module.composition_notes}
                    </p>
                  </div>
                </>
              )}
              
              <Separator />
              
              {/* Quality Score */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Quality Score</span>
                </div>
                <span className={`text-lg font-bold ${qualityPercent >= 80 ? 'text-green-600' : qualityPercent >= 60 ? 'text-yellow-600' : 'text-muted-foreground'}`}>
                  {qualityPercent}%
                </span>
              </div>
              
              {/* Save Button */}
              <div className="pt-4">
                <Button 
                  onClick={handleSave} 
                  disabled={isSaving}
                  className="w-full"
                >
                  {isSaving ? 'Saving...' : moduleType !== module.module_type ? 'Save Changes' : 'Close'}
                </Button>
              </div>
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
