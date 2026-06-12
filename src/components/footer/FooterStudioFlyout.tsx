// Footer Studio — a wide right-side flyout for quickly modifying the footer of
// a single campaign. Three edit surfaces over the existing footer
// representation (brand_footers html / image_slices — see footerDoc.ts):
//   1. type-to-edit  — click alt text / links / legal copy inline
//   2. drag-and-drop — reorder footer rows (and the legal block) via handles
//   3. color themes  — brand-derived presets + manual swatches
// plus a slim agent strip (footer-agent edge function) and two exits:
//   "Use for this campaign" (campaign_queue.footer_override_*) or
//   "Save as version" (new brand_footers row, optional brand default).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowUpRight,
  Check,
  CornerDownLeft,
  GripVertical,
  Link as LinkIcon,
  Loader2,
  Plus,
  Sparkles,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { InlineLegalEditor } from '@/components/footer/InlineLegalEditor';
import {
  applyThemeToDoc,
  buildFooterRows,
  buildThemePresets,
  footerDocFromRow,
  footerDocToHtml,
  isFooterDoc,
  reorderImageFooter,
  type FooterDoc,
  type FooterRowItem,
  type FooterTheme,
} from '@/components/footer/footerDoc';
import type { ImageFooterSlice, LegalSectionData, StoredImageFooterData } from '@/types/footer';

const CANVAS_WIDTH = 520; // edit canvas width inside the flyout (email is 600)
const MAX_UNDO = 10;

interface FooterVersion {
  id: string;
  name: string;
  html: string;
  footer_type: string | null;
  image_slices: unknown;
  is_primary: boolean | null;
}

interface BrandColors {
  primary_color?: string | null;
  secondary_color?: string | null;
  background_color?: string | null;
  text_primary_color?: string | null;
}

interface FooterStudioFlyoutProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  brandId: string;
  queueId: string;
  /** What the expanded panel is currently rendering (legacy brands.footer_html fallback). */
  fallbackFooterHtml?: string | null;
  /** campaign_queue.footer_override_state — restores a previous one-off edit. */
  overrideState?: unknown;
  /** Called with the compiled HTML after "Use for this campaign". */
  onApplied: (html: string) => void;
}

// ---------------------------------------------------------------------------
// Sortable row wrapper — transform/opacity only, 150-250ms
// ---------------------------------------------------------------------------

function SortableRow({ id, children }: { id: string; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition: transition ?? undefined }}
      className={cn('group/frow relative', isDragging && 'z-10 opacity-80')}
    >
      <button
        {...attributes}
        {...listeners}
        className="absolute -left-7 top-1/2 -translate-y-1/2 cursor-grab rounded-md p-1 text-muted-foreground/40 opacity-0 transition-opacity duration-150 hover:text-muted-foreground focus-visible:opacity-100 group-hover/frow:opacity-100 active:cursor-grabbing"
        aria-label="Drag to reorder"
        tabIndex={0}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------

export function FooterStudioFlyout({
  open,
  onOpenChange,
  brandId,
  queueId,
  fallbackFooterHtml,
  overrideState,
  onApplied,
}: FooterStudioFlyoutProps) {
  const [doc, setDoc] = useState<FooterDoc | null>(null);
  const [undoStack, setUndoStack] = useState<FooterDoc[]>([]);
  const [versions, setVersions] = useState<FooterVersion[]>([]);
  const [activeVersionId, setActiveVersionId] = useState<string | null>(null);
  const [brandColors, setBrandColors] = useState<BrandColors | null>(null);
  const [brandLinks, setBrandLinks] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sourceImageMeta, setSourceImageMeta] = useState<{ originalImageUrl: string; jobId?: string }>({ originalImageUrl: '' });

  // Inline editing state
  const [editingAlt, setEditingAlt] = useState<number | null>(null);
  const [editingLink, setEditingLink] = useState<number | null>(null);
  const [linkDraft, setLinkDraft] = useState('');

  // Theme state (manual swatches mirror the last applied theme)
  const [theme, setTheme] = useState<FooterTheme>({ background: '#ffffff', text: '#1a1a1a', accent: '#1a1a1a' });

  // Agent strip
  const [agentInput, setAgentInput] = useState('');
  const [agentBusy, setAgentBusy] = useState(false);
  const [agentSummary, setAgentSummary] = useState<string | null>(null);

  // Save-as-version popover
  const [savePopoverOpen, setSavePopoverOpen] = useState(false);
  const [versionName, setVersionName] = useState('');
  const [makeDefault, setMakeDefault] = useState(false);
  const [isSavingVersion, setIsSavingVersion] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // HTML-kind editable iframe
  const htmlFrameRef = useRef<HTMLIFrameElement>(null);
  const [htmlFrameHeight, setHtmlFrameHeight] = useState(220);
  const [htmlEpoch, setHtmlEpoch] = useState(0); // bumps when html changes from OUTSIDE the iframe
  const htmlEpochDocRef = useRef<string>('');

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  // ---- Load footer + brand context when opened --------------------------
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setIsLoading(true);
      try {
        const [footersRes, brandRes, linksRes] = await Promise.all([
          supabase
            .from('brand_footers')
            .select('id, name, html, footer_type, image_slices, is_primary')
            .eq('brand_id', brandId)
            .order('is_primary', { ascending: false })
            .order('updated_at', { ascending: false }),
          supabase
            .from('brands')
            .select('primary_color, secondary_color, background_color, text_primary_color')
            .eq('id', brandId)
            .single(),
          supabase
            .from('brand_link_index')
            .select('url')
            .eq('brand_id', brandId)
            .eq('is_healthy', true)
            .order('use_count', { ascending: false })
            .limit(50),
        ]);
        if (cancelled) return;

        const rows = (footersRes.data ?? []) as FooterVersion[];
        setVersions(rows);
        setBrandColors((brandRes.data as BrandColors) ?? null);
        setBrandLinks((linksRes.data ?? []).map((l: { url: string }) => l.url));

        // Initial doc: campaign override state > primary/most-recent saved footer > legacy html
        let initial: FooterDoc | null = null;
        if (isFooterDoc(overrideState)) {
          initial = overrideState as FooterDoc;
          setActiveVersionId(null);
        } else if (rows.length > 0) {
          initial = footerDocFromRow(rows[0]);
          setActiveVersionId(rows[0].id);
          const stored = rows[0].image_slices as StoredImageFooterData | null;
          if (stored?.originalImageUrl) {
            setSourceImageMeta({ originalImageUrl: stored.originalImageUrl, jobId: stored.jobId });
          }
        } else if (fallbackFooterHtml) {
          initial = { kind: 'html', html: fallbackFooterHtml };
          setActiveVersionId(null);
        }
        setDoc(initial);
        setUndoStack([]);
        setAgentSummary(null);
        if (initial?.kind === 'image' && initial.legalSection) {
          setTheme((t) => ({
            background: initial.legalSection?.backgroundColor || '#ffffff',
            text: initial.legalSection?.textColor || '#1a1a1a',
            accent: t.accent,
          }));
        }
        if (initial?.kind === 'html') {
          htmlEpochDocRef.current = initial.html;
          setHtmlEpoch((e) => e + 1);
        }
      } catch (err) {
        console.error('[FooterStudio] load failed:', err);
        toast.error('Could not load the footer');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, brandId]);

  // ---- Undo plumbing ------------------------------------------------------
  const commit = useCallback((next: FooterDoc, opts?: { skipUndo?: boolean }) => {
    setDoc((prev) => {
      if (prev && !opts?.skipUndo) {
        setUndoStack((stack) => [...stack.slice(-(MAX_UNDO - 1)), prev]);
      }
      return next;
    });
  }, []);

  const handleUndo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const prev = stack[stack.length - 1];
      setDoc(prev);
      if (prev.kind === 'html') {
        htmlEpochDocRef.current = prev.html;
        setHtmlEpoch((e) => e + 1);
      }
      return stack.slice(0, -1);
    });
  }, []);

  // ---- HTML-kind editable iframe -----------------------------------------
  // The raw-HTML footer renders inside a same-origin iframe with designMode on,
  // so "type to edit" works directly on the rendered footer. Edits are captured
  // back from the wrapper table whenever we need the current state.
  const htmlSrcDoc = useMemo(() => {
    if (doc?.kind !== 'html') return '';
    // htmlEpoch gates re-renders: typing inside the iframe must not remount it.
    void htmlEpoch;
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { margin:0; padding:0; }
      table { border-collapse: collapse; }
      img { max-width:100%; height:auto; }
      body:focus { outline:none; }
    </style></head><body>
      <table id="footer-root" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;margin:0;">${htmlEpochDocRef.current}</table>
      <script>document.designMode='on';<\/script>
    </body></html>`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.kind, htmlEpoch]);

  const captureHtmlEdits = useCallback((): FooterDoc | null => {
    if (!doc) return null;
    if (doc.kind !== 'html') return doc;
    try {
      const root = htmlFrameRef.current?.contentDocument?.getElementById('footer-root');
      if (root) {
        const edited = root.innerHTML.replace(/<\/?tbody[^>]*>/gi, '').trim();
        if (edited && edited !== doc.html) {
          const next: FooterDoc = { kind: 'html', html: edited };
          commit(next);
          htmlEpochDocRef.current = edited;
          return next;
        }
      }
    } catch { /* same-origin srcdoc; should not throw */ }
    return doc;
  }, [doc, commit]);

  const handleHtmlFrameLoad = useCallback(() => {
    const frameDoc = htmlFrameRef.current?.contentDocument;
    if (frameDoc?.body) setHtmlFrameHeight(Math.max(80, frameDoc.body.scrollHeight));
  }, []);

  /** Latest doc including any in-iframe typing (call before any action). */
  const currentDoc = useCallback((): FooterDoc | null => {
    return doc?.kind === 'html' ? captureHtmlEdits() : doc;
  }, [doc, captureHtmlEdits]);

  // ---- Image-kind editing -------------------------------------------------
  const rows: FooterRowItem[] = useMemo(() => {
    if (doc?.kind !== 'image') return [];
    return buildFooterRows(doc.slices, doc.legalSection);
  }, [doc]);

  const updateSlice = useCallback((index: number, updates: Partial<ImageFooterSlice>) => {
    if (doc?.kind !== 'image') return;
    commit({
      ...doc,
      slices: doc.slices.map((s, i) => (i === index ? { ...s, ...updates } : s)),
    });
  }, [doc, commit]);

  const updateLegal = useCallback((updates: Partial<LegalSectionData>) => {
    if (doc?.kind !== 'image' || !doc.legalSection) return;
    commit({ ...doc, legalSection: { ...doc.legalSection, ...updates } });
  }, [doc, commit]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (doc?.kind !== 'image' || !over || active.id === over.id) return;
    const oldIndex = rows.findIndex((r) => r.id === active.id);
    const newIndex = rows.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(rows, oldIndex, newIndex);
    const next = reorderImageFooter(doc.slices, doc.legalSection, reordered);
    commit({ kind: 'image', ...next });
  }, [doc, rows, commit]);

  const handleAddLegal = useCallback(() => {
    if (doc?.kind !== 'image' || doc.legalSection) return;
    commit({
      ...doc,
      legalSection: {
        yStart: doc.slices.length > 0 ? Math.max(...doc.slices.map((s) => s.yBottom)) : 0,
        backgroundColor: '#ffffff',
        textColor: '#1a1a1a',
        detectedElements: [],
      },
    });
  }, [doc, commit]);

  // ---- Theme ---------------------------------------------------------------
  const themePresets = useMemo(() => buildThemePresets(brandColors), [brandColors]);

  const applyTheme = useCallback((t: FooterTheme) => {
    const base = currentDoc();
    if (!base) return;
    setTheme(t);
    const next = applyThemeToDoc(base, t);
    commit(next);
    if (next.kind === 'html') {
      htmlEpochDocRef.current = next.html;
      setHtmlEpoch((e) => e + 1);
    }
  }, [currentDoc, commit]);

  // ---- Agent ----------------------------------------------------------------
  const sendToAgent = useCallback(async () => {
    const instruction = agentInput.trim();
    const base = currentDoc();
    if (!instruction || !base || agentBusy) return;
    setAgentBusy(true);
    setAgentSummary(null);
    try {
      const { data, error } = await supabase.functions.invoke('footer-agent', {
        body: { brandId, instruction, footer: base },
      });
      if (error) throw new Error(error.message || 'Agent request failed');
      if (data?.error) throw new Error(data.error);
      if (!isFooterDoc(data?.footer)) throw new Error('Agent returned an invalid footer');
      commit(data.footer as FooterDoc);
      if ((data.footer as FooterDoc).kind === 'html') {
        htmlEpochDocRef.current = (data.footer as { html: string }).html;
        setHtmlEpoch((e) => e + 1);
      }
      setAgentSummary(typeof data.summary === 'string' ? data.summary : 'Footer updated');
      setAgentInput('');
    } catch (err) {
      console.error('[FooterStudio] agent failed:', err);
      toast.error(err instanceof Error ? err.message : 'The footer agent hit an error');
    } finally {
      setAgentBusy(false);
    }
  }, [agentInput, agentBusy, brandId, currentDoc, commit]);

  // ---- Exits -----------------------------------------------------------------
  const handleUseOnce = useCallback(async () => {
    const base = currentDoc();
    if (!base) return;
    setIsApplying(true);
    try {
      const html = footerDocToHtml(base, 600);
      const { error } = await supabase
        .from('campaign_queue')
        .update({
          footer_override_html: html,
          footer_override_state: JSON.parse(JSON.stringify(base)),
        })
        .eq('id', queueId);
      if (error) throw error;
      onApplied(html);
      toast.success('Footer applied to this campaign');
      onOpenChange(false);
    } catch (err) {
      console.error('[FooterStudio] apply failed:', err);
      toast.error('Failed to apply the footer');
    } finally {
      setIsApplying(false);
    }
  }, [currentDoc, queueId, onApplied, onOpenChange]);

  const handleSaveVersion = useCallback(async () => {
    const base = currentDoc();
    const name = versionName.trim();
    if (!base || !name) return;
    setIsSavingVersion(true);
    try {
      const html = footerDocToHtml(base, 600);
      if (makeDefault) {
        await supabase.from('brand_footers').update({ is_primary: false }).eq('brand_id', brandId);
      }
      const imageSlices: StoredImageFooterData | null = base.kind === 'image'
        ? {
            slices: base.slices,
            legalSection: base.legalSection,
            originalImageUrl: sourceImageMeta.originalImageUrl,
            generatedAt: new Date().toISOString(),
            ...(sourceImageMeta.jobId ? { jobId: sourceImageMeta.jobId } : {}),
          }
        : null;
      const { data, error } = await supabase
        .from('brand_footers')
        .insert({
          brand_id: brandId,
          name,
          html,
          footer_type: base.kind,
          image_slices: imageSlices ? JSON.parse(JSON.stringify(imageSlices)) : null,
          is_primary: makeDefault,
        })
        .select('id, name, html, footer_type, image_slices, is_primary')
        .single();
      if (error) throw error;
      setVersions((prev) => [data as FooterVersion, ...prev.map((v) => (makeDefault ? { ...v, is_primary: false } : v))]);
      setActiveVersionId(data.id);
      setSavePopoverOpen(false);
      setVersionName('');
      setMakeDefault(false);
      toast.success(`Saved "${name}"${makeDefault ? ' as the brand default' : ''}`);
    } catch (err) {
      console.error('[FooterStudio] save version failed:', err);
      toast.error('Failed to save the footer version');
    } finally {
      setIsSavingVersion(false);
    }
  }, [currentDoc, versionName, makeDefault, brandId, sourceImageMeta]);

  const loadVersion = useCallback((id: string) => {
    const row = versions.find((v) => v.id === id);
    if (!row) return;
    const next = footerDocFromRow(row);
    commit(next);
    setActiveVersionId(id);
    const stored = row.image_slices as StoredImageFooterData | null;
    if (stored?.originalImageUrl) setSourceImageMeta({ originalImageUrl: stored.originalImageUrl, jobId: stored.jobId });
    if (next.kind === 'html') {
      htmlEpochDocRef.current = next.html;
      setHtmlEpoch((e) => e + 1);
    }
  }, [versions, commit]);

  // ---- Render -----------------------------------------------------------------
  const filteredLinks = useMemo(
    () => brandLinks.filter((l) => l.toLowerCase().includes(linkDraft.toLowerCase())).slice(0, 6),
    [brandLinks, linkDraft],
  );

  const renderSliceRow = (row: Extract<FooterRowItem, { type: 'slices' }>) => {
    const isMultiColumn = row.slices.length > 1 || (row.slices[0]?.slice.totalColumns ?? 1) > 1;
    return (
      <div className="relative">
        <div className="flex" style={{ width: CANVAS_WIDTH }}>
          {row.slices.map(({ slice, originalIndex }) => {
            const colWidth = isMultiColumn
              ? CANVAS_WIDTH / (slice.totalColumns || row.slices.length)
              : CANVAS_WIDTH;
            return (
              <div key={originalIndex} style={{ width: colWidth }} className="relative">
                {slice.imageUrl ? (
                  <img src={slice.imageUrl} alt={slice.altText || ''} className="block w-full" draggable={false} />
                ) : (
                  <div className="flex h-12 w-full items-center justify-center bg-muted text-[10px] text-muted-foreground">
                    No image
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* Type-to-edit strip — appears on hover under the row */}
        <div className="flex flex-col gap-1 py-1 opacity-0 transition-opacity duration-150 focus-within:opacity-100 group-hover/frow:opacity-100">
          {row.slices.map(({ slice, originalIndex }, colIdx) => (
            <div key={originalIndex} className="flex items-center gap-2 text-[10px]">
              {isMultiColumn && (
                <span className="w-8 flex-shrink-0 text-right font-medium text-muted-foreground/60">
                  Col {colIdx + 1}
                </span>
              )}
              {/* Link */}
              {editingLink === originalIndex ? (
                <div className="relative flex-1">
                  <Input
                    autoFocus
                    value={linkDraft}
                    onChange={(e) => setLinkDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        updateSlice(originalIndex, { link: linkDraft || null, linkSource: 'manual' });
                        setEditingLink(null);
                      }
                      if (e.key === 'Escape') setEditingLink(null);
                    }}
                    onBlur={() => setEditingLink(null)}
                    placeholder="https://…"
                    className="h-6 rounded-lg text-[10px]"
                  />
                  {filteredLinks.length > 0 && (
                    <div className="absolute left-0 right-0 top-7 z-20 overflow-hidden rounded-xl border bg-card shadow-md">
                      {filteredLinks.map((l) => (
                        <button
                          key={l}
                          className="block w-full truncate px-2.5 py-1.5 text-left text-[10px] text-muted-foreground transition-colors duration-150 hover:bg-muted hover:text-foreground"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            updateSlice(originalIndex, { link: l, linkSource: 'manual' });
                            setEditingLink(null);
                          }}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <button
                  onClick={() => { setEditingLink(originalIndex); setLinkDraft(slice.link ?? ''); setEditingAlt(null); }}
                  className={cn(
                    'flex min-w-0 flex-1 items-center gap-1 truncate rounded-md px-1.5 py-0.5 text-left transition-colors duration-150 hover:bg-muted',
                    slice.link ? 'text-muted-foreground' : 'italic text-muted-foreground/50',
                  )}
                >
                  <LinkIcon className="h-2.5 w-2.5 flex-shrink-0" />
                  <span className="truncate">{slice.link || 'Add link…'}</span>
                </button>
              )}
              {/* Alt text */}
              {editingAlt === originalIndex ? (
                <Input
                  autoFocus
                  defaultValue={slice.altText || ''}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      updateSlice(originalIndex, { altText: (e.target as HTMLInputElement).value });
                      setEditingAlt(null);
                    }
                    if (e.key === 'Escape') setEditingAlt(null);
                  }}
                  onBlur={(e) => {
                    if (e.target.value !== (slice.altText || '')) updateSlice(originalIndex, { altText: e.target.value });
                    setEditingAlt(null);
                  }}
                  placeholder="Alt text…"
                  className="h-6 flex-1 rounded-lg text-[10px]"
                />
              ) : (
                <button
                  onClick={() => { setEditingAlt(originalIndex); setEditingLink(null); }}
                  className={cn(
                    'min-w-0 flex-1 truncate rounded-md px-1.5 py-0.5 text-left transition-colors duration-150 hover:bg-muted',
                    slice.altText ? 'text-muted-foreground' : 'italic text-muted-foreground/50',
                  )}
                >
                  {slice.altText || 'Add alt text…'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-[94vw] flex-col gap-0 overflow-hidden rounded-l-3xl border-l p-0 sm:max-w-[820px]"
      >
        {/* Header */}
        <SheetHeader className="space-y-0 border-b px-6 py-4">
          <div className="flex items-center justify-between pr-8">
            <div>
              <SheetTitle className="text-[13px] font-semibold">Footer studio</SheetTitle>
              <SheetDescription className="text-[11px] text-muted-foreground">
                Edit inline, drag rows to reorder, or ask the agent. Applies to this campaign unless saved.
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              {versions.length > 0 && (
                <Select value={activeVersionId ?? undefined} onValueChange={loadVersion}>
                  <SelectTrigger className="h-7 w-[180px] rounded-full text-[11px]">
                    <SelectValue placeholder="Footer version…" />
                  </SelectTrigger>
                  <SelectContent>
                    {versions.map((v) => (
                      <SelectItem key={v.id} value={v.id} className="text-[11px]">
                        {v.name}{v.is_primary ? ' · default' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-7 rounded-full px-2.5 text-[11px]"
                onClick={handleUndo}
                disabled={undoStack.length === 0}
              >
                <Undo2 className="mr-1 h-3 w-3" />
                Undo
              </Button>
            </div>
          </div>
        </SheetHeader>

        {/* Theme bar */}
        <div className="flex items-center gap-4 border-b bg-muted/30 px-6 py-2.5">
          <span className="text-[11px] font-medium text-muted-foreground">Theme</span>
          <div className="flex items-center gap-1.5">
            {themePresets.map((p) => (
              <button
                key={p.name}
                onClick={() => applyTheme(p.theme)}
                className="group flex items-center gap-1.5 rounded-full border bg-card py-1 pl-1.5 pr-2.5 transition-transform duration-150 hover:-translate-y-px active:translate-y-0"
                title={`${p.name} theme`}
              >
                <span className="flex -space-x-1">
                  <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: p.theme.background }} />
                  <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: p.theme.text }} />
                  <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: p.theme.accent }} />
                </span>
                <span className="text-[10px] font-medium text-muted-foreground group-hover:text-foreground">{p.name}</span>
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2.5">
            {(['background', 'text', 'accent'] as const).map((key) => (
              <label key={key} className="flex cursor-pointer items-center gap-1" title={`${key} color`}>
                <span className="text-[10px] capitalize text-muted-foreground">{key === 'background' ? 'bg' : key}</span>
                <span className="relative h-5 w-5 overflow-hidden rounded-full border">
                  <input
                    type="color"
                    value={theme[key]}
                    onChange={(e) => applyTheme({ ...theme, [key]: e.target.value })}
                    className="absolute -inset-1 h-8 w-8 cursor-pointer border-0 p-0"
                  />
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-y-auto bg-muted/20 px-6 py-6">
          {isLoading && (
            <div className="flex h-40 items-center justify-center text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}

          {!isLoading && !doc && (
            <div className="flex h-40 flex-col items-center justify-center gap-2 text-center">
              <p className="text-[12px] text-muted-foreground">
                This brand has no footer yet. Build one in the brand's email settings first.
              </p>
            </div>
          )}

          {!isLoading && doc?.kind === 'image' && (
            <div className="mx-auto pl-7" style={{ width: CANVAS_WIDTH + 28 }}>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
                  {rows.map((row) => (
                    <SortableRow key={row.id} id={row.id}>
                      {row.type === 'slices' ? (
                        renderSliceRow(row)
                      ) : (
                        doc.legalSection && (
                          <InlineLegalEditor
                            legalSection={doc.legalSection}
                            onUpdate={updateLegal}
                            width={CANVAS_WIDTH}
                          />
                        )
                      )}
                    </SortableRow>
                  ))}
                </SortableContext>
              </DndContext>
              {!doc.legalSection && (
                <Button variant="outline" size="sm" className="mt-3 h-7 rounded-full text-[11px]" onClick={handleAddLegal}>
                  <Plus className="mr-1 h-3 w-3" />
                  Add legal section
                </Button>
              )}
            </div>
          )}

          {!isLoading && doc?.kind === 'html' && (
            <div className="mx-auto" style={{ width: CANVAS_WIDTH }}>
              <p className="mb-2 text-center text-[10px] text-muted-foreground/70">
                Click into the footer to edit text directly. Row drag-and-drop is available for image footers.
              </p>
              <div
                className="overflow-hidden rounded-lg border bg-white shadow-sm"
                style={{ height: htmlFrameHeight * (CANVAS_WIDTH / 600) }}
              >
                <iframe
                  key={htmlEpoch}
                  ref={htmlFrameRef}
                  srcDoc={htmlSrcDoc}
                  onLoad={handleHtmlFrameLoad}
                  onBlur={captureHtmlEdits}
                  title="Footer editor"
                  scrolling="no"
                  style={{
                    width: 600,
                    height: htmlFrameHeight,
                    border: 'none',
                    display: 'block',
                    transform: `scale(${CANVAS_WIDTH / 600})`,
                    transformOrigin: 'top left',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Agent strip */}
        <div className="border-t px-6 py-3">
          {agentSummary && (
            <div className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground animate-in fade-in-0 duration-200">
              <Check className="h-3 w-3 text-success" />
              {agentSummary}
            </div>
          )}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Sparkles className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/50" />
              <Input
                value={agentInput}
                onChange={(e) => setAgentInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToAgent(); } }}
                placeholder="Ask the footer agent… e.g. “make the legal section dark” or “swap the SMS row to the bottom”"
                disabled={agentBusy || !doc}
                className="h-9 rounded-full pl-9 pr-10 text-[12px]"
              />
              <button
                onClick={sendToAgent}
                disabled={agentBusy || !agentInput.trim() || !doc}
                className="absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full bg-foreground text-background transition-opacity duration-150 disabled:opacity-30"
                aria-label="Send to footer agent"
              >
                {agentBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <CornerDownLeft className="h-3 w-3" />}
              </button>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex items-center justify-between border-t bg-muted/30 px-6 py-3">
          <Popover open={savePopoverOpen} onOpenChange={setSavePopoverOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 rounded-full text-[12px]" disabled={!doc}>
                Save as version
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-72 rounded-2xl p-4" align="start" side="top">
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium">Version name</label>
                  <Input
                    value={versionName}
                    onChange={(e) => setVersionName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleSaveVersion(); }}
                    placeholder="e.g. Summer dark footer"
                    className="h-8 text-[12px]"
                    autoFocus
                  />
                </div>
                <label className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-muted-foreground">Make brand default</span>
                  <Switch checked={makeDefault} onCheckedChange={setMakeDefault} />
                </label>
                <Button
                  size="sm"
                  className="h-8 w-full rounded-full text-[12px]"
                  onClick={handleSaveVersion}
                  disabled={!versionName.trim() || isSavingVersion}
                >
                  {isSavingVersion ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                  Save version
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button
            size="sm"
            className="h-8 rounded-full px-4 text-[12px] shadow-[inset_0_1px_0_rgba(255,255,255,0.12),0_1px_2px_rgba(0,0,0,0.25)] transition-transform duration-150 active:scale-[0.98]"
            onClick={handleUseOnce}
            disabled={!doc || isApplying}
          >
            {isApplying ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : <ArrowUpRight className="mr-1.5 h-3 w-3" />}
            Use for this campaign
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
