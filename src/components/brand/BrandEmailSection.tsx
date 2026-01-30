import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Trash2, Star, Code, Image } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Brand, BrandFooter } from '@/types/brand-assets';
import { FooterBuilderModal } from '@/components/FooterBuilderModal';

interface BrandEmailSectionProps {
  brand: Brand;
  onBrandChange: () => void;
}

export function BrandEmailSection({ brand, onBrandChange }: BrandEmailSectionProps) {
  const navigate = useNavigate();
  const [footers, setFooters] = useState<BrandFooter[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  // Footer editor state
  const [footerEditorOpen, setFooterEditorOpen] = useState(false);
  const [editingFooter, setEditingFooter] = useState<BrandFooter | null>(null);
  const [footerName, setFooterName] = useState('');
  const [footerHtml, setFooterHtml] = useState('');
  const [footerIsPrimary, setFooterIsPrimary] = useState(false);

  // Footer method selection state
  const [addFooterMethodOpen, setAddFooterMethodOpen] = useState(false);
  const [footerBuilderOpen, setFooterBuilderOpen] = useState(false);

  useEffect(() => {
    fetchFooters();
  }, [brand.id]);

  const fetchFooters = async () => {
    const { data, error } = await supabase
      .from('brand_footers')
      .select('*')
      .eq('brand_id', brand.id)
      .order('is_primary', { ascending: false });

    if (!error && data) {
      setFooters(data.map(row => ({
        id: row.id,
        brandId: row.brand_id,
        name: row.name,
        html: row.html,
        isPrimary: row.is_primary || false,
        logoUrl: row.logo_url || undefined,
        logoPublicId: row.logo_public_id || undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })));
    }
  };

  const openFooterEditor = (footer?: BrandFooter) => {
    if (footer) {
      setEditingFooter(footer);
      setFooterName(footer.name);
      setFooterHtml(footer.html);
      setFooterIsPrimary(footer.isPrimary);
    } else {
      setEditingFooter(null);
      setFooterName('');
      setFooterHtml('');
      setFooterIsPrimary(footers.length === 0);
    }
    setFooterEditorOpen(true);
  };

  const handleSaveFooter = async () => {
    if (!footerName.trim() || !footerHtml.trim()) {
      toast.error('Name and HTML are required');
      return;
    }

    setIsSaving(true);
    try {
      if (footerIsPrimary) {
        await supabase
          .from('brand_footers')
          .update({ is_primary: false })
          .eq('brand_id', brand.id);
      }

      if (editingFooter) {
        const { error } = await supabase
          .from('brand_footers')
          .update({
            name: footerName,
            html: footerHtml,
            is_primary: footerIsPrimary,
          })
          .eq('id', editingFooter.id);

        if (error) throw error;
        toast.success('Footer updated');
      } else {
        const { error } = await supabase
          .from('brand_footers')
          .insert({
            brand_id: brand.id,
            name: footerName,
            html: footerHtml,
            is_primary: footerIsPrimary,
          });

        if (error) throw error;
        toast.success('Footer created');
      }

      setFooterEditorOpen(false);
      fetchFooters();
    } catch (error) {
      toast.error('Failed to save footer');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteFooter = async (footer: BrandFooter) => {
    if (!confirm(`Delete "${footer.name}"?`)) return;

    const { error } = await supabase
      .from('brand_footers')
      .delete()
      .eq('id', footer.id);

    if (error) {
      toast.error('Failed to delete footer');
      return;
    }

    toast.success('Footer deleted');
    fetchFooters();
  };

  const handleSetPrimary = async (footer: BrandFooter) => {
    try {
      await supabase
        .from('brand_footers')
        .update({ is_primary: false })
        .eq('brand_id', brand.id);

      await supabase
        .from('brand_footers')
        .update({ is_primary: true })
        .eq('id', footer.id);

      toast.success('Primary footer updated');
      fetchFooters();
    } catch (error) {
      toast.error('Failed to update primary footer');
    }
  };

  return (
    <div className="space-y-6">
      {/* Footers */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm font-medium">Footers</CardTitle>
              <CardDescription className="text-xs">{footers.length} footer{footers.length !== 1 ? 's' : ''} configured</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={() => setAddFooterMethodOpen(true)}>
              <Plus className="h-3 w-3 mr-1" />
              Add Footer
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {footers.length === 0 ? (
            <div className="py-8 text-center border border-dashed border-border/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-4">No footers yet</p>
              <Button size="sm" onClick={() => setAddFooterMethodOpen(true)}>
                <Plus className="h-3 w-3 mr-1" />
                Create your first footer
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {footers.map((footer) => (
                <div key={footer.id} className="group">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      {footer.isPrimary && <Star className="h-3 w-3 text-primary fill-primary" />}
                      <span className="text-xs font-medium truncate">{footer.name}</span>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!footer.isPrimary && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleSetPrimary(footer)} title="Set Primary">
                          <Star className="h-3 w-3" />
                        </Button>
                      )}
                      <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openFooterEditor(footer)}>
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteFooter(footer)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {/* Footer preview */}
                  <div className="bg-muted/20 rounded-lg overflow-hidden h-[180px]">
                    <iframe
                      srcDoc={`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    html, body { margin: 0; padding: 0; background: #f6f6f6; font-family: Arial, sans-serif; }
  </style>
</head>
<body>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width: 600px; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    ${footer.html}
  </table>
</body>
</html>`}
                      className="border-0"
                      style={{ 
                        width: '600px',
                        height: '540px',
                        transform: 'scale(0.33)',
                        transformOrigin: 'top left',
                      }}
                      sandbox="allow-same-origin"
                      title={`${footer.name} preview`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Typography Info (if available) */}
      {brand.typography && Object.keys(brand.typography).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Typography</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {brand.typography.fontFamilies && Object.keys(brand.typography.fontFamilies).length > 0 && (
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {Object.entries(brand.typography.fontFamilies).map(([key, value]) => (
                    <div key={key} className="text-sm">
                      <span className="text-muted-foreground">{key}:</span>{' '}
                      <span className="font-medium">{value}</span>
                    </div>
                  ))}
                </div>
              )}
              {brand.typography.fonts && brand.typography.fonts.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {brand.typography.fonts.map((font: any, i: number) => (
                    <span key={i} className="text-sm">
                      {font.family}
                      {font.role && <span className="text-muted-foreground"> ({font.role})</span>}
                      {i < brand.typography!.fonts!.length - 1 && <span className="text-muted-foreground">,</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Footer Editor Dialog */}
      <Dialog open={footerEditorOpen} onOpenChange={setFooterEditorOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingFooter ? 'Edit Footer' : 'Add Footer'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input
                placeholder="e.g., Standard Footer, Holiday Footer"
                value={footerName}
                onChange={(e) => setFooterName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>HTML</Label>
              <Textarea
                placeholder="<table>...</table>"
                value={footerHtml}
                onChange={(e) => setFooterHtml(e.target.value)}
                className="font-mono text-xs min-h-[200px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={footerIsPrimary}
                onCheckedChange={setFooterIsPrimary}
              />
              <Label>Set as primary footer</Label>
            </div>
            {footerHtml && (
              <div className="space-y-2">
                <Label>Preview</Label>
                <div className="rounded-lg overflow-hidden bg-muted/30">
                  <iframe
                    srcDoc={footerHtml}
                    className="w-full h-48 border-0"
                    sandbox="allow-same-origin"
                  />
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFooterEditorOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveFooter} disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Footer Method Selection Dialog */}
      <Dialog open={addFooterMethodOpen} onOpenChange={setAddFooterMethodOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Footer</DialogTitle>
            <DialogDescription>
              Choose how you want to create your footer
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <button
              onClick={() => {
                setAddFooterMethodOpen(false);
                setFooterBuilderOpen(true);
              }}
              className="flex flex-col items-center gap-3 p-6 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Image className="h-5 w-5 text-primary" />
              </div>
              <div className="text-center">
                <h3 className="font-medium text-sm">Create from Image</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Upload a reference image and we'll generate the HTML
                </p>
              </div>
            </button>
            <button
              onClick={() => {
                setAddFooterMethodOpen(false);
                openFooterEditor();
              }}
              className="flex flex-col items-center gap-3 p-6 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-muted/30 transition-colors"
            >
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                <Code className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="text-center">
                <h3 className="font-medium text-sm">Upload HTML</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Paste your own footer HTML code directly
                </p>
              </div>
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Footer Builder Modal */}
      <FooterBuilderModal
        open={footerBuilderOpen}
        onOpenChange={setFooterBuilderOpen}
        brand={brand}
        onFooterSaved={() => {
          fetchFooters();
          onBrandChange();
        }}
        onOpenStudio={(referenceImageUrl, footerHtml, figmaDesignData, conversationHistory, sessionId) => {
          navigate(`/footer-editor/${brand.id}`, {
            state: {
              referenceImageUrl,
              footerHtml,
              footerName: 'New Footer',
              figmaDesignData,
              conversationHistory,
              sessionId,
            }
          });
        }}
      />
    </div>
  );
}
