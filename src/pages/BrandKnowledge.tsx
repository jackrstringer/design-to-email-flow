import { useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { Brain, Flag, Pencil, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import type { BrandContextData } from '@/layouts/BrandLayout';
import { AGENT_META, KNOWLEDGE_KIND_META, type AgentKind, type KnowledgeKind } from '@/lib/agentMeta';
import {
  useBrandKnowledge,
  useAddKnowledge,
  useUpdateKnowledge,
  useRetireKnowledge,
  type BrandKnowledgeEntry,
  type KnowledgeEntryInput,
} from '@/hooks/useBrandKnowledge';
import { useAgentRuns } from '@/hooks/useAgentRuns';
import { FlagMistakeDialog } from '@/components/knowledge/FlagMistakeDialog';

// Display order for knowledge kinds on this page.
const KIND_ORDER: KnowledgeKind[] = ['link_rule', 'promo', 'voice', 'style', 'product', 'mistake', 'fact'];

function ConfidenceDots({ value }: { value: number }) {
  // confidence may be stored as 0–1 or 1–3; normalize to 1–3 filled dots.
  const filled = value > 1
    ? Math.min(3, Math.max(1, Math.round(value)))
    : value >= 0.8 ? 3 : value >= 0.5 ? 2 : 1;
  return (
    <span className="inline-flex items-center gap-0.5" title={`Confidence ${filled}/3`}>
      {[1, 2, 3].map(i => (
        <span
          key={i}
          className={cn('w-1.5 h-1.5 rounded-full', i <= filled ? 'bg-foreground/50' : 'bg-foreground/15')}
        />
      ))}
    </span>
  );
}

interface KnowledgeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial?: BrandKnowledgeEntry | null;
  onSubmit: (input: KnowledgeEntryInput) => Promise<void>;
  isPending: boolean;
}

function KnowledgeDialog({ open, onOpenChange, initial, onSubmit, isPending }: KnowledgeDialogProps) {
  const [kind, setKind] = useState<KnowledgeKind>((initial?.kind as KnowledgeKind) || 'fact');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [validUntil, setValidUntil] = useState(initial?.valid_until ? initial.valid_until.slice(0, 10) : '');

  const handleSubmit = async () => {
    if (!title.trim() || !content.trim()) return;
    await onSubmit({
      kind,
      title: title.trim(),
      content: content.trim(),
      valid_until: validUntil || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit knowledge' : 'Add knowledge'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Kind</label>
            <Select value={kind} onValueChange={(v) => setKind(v as KnowledgeKind)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {KIND_ORDER.map(k => (
                  <SelectItem key={k} value={k}>
                    {KNOWLEDGE_KIND_META[k].label}
                    <span className="text-muted-foreground ml-2 text-xs">{KNOWLEDGE_KIND_META[k].description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Title</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Hero CTAs go to the sale collection"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Details</label>
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What should Sendr remember?"
              rows={4}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              Expires <span className="text-muted-foreground font-normal">(optional, for promos)</span>
            </label>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || !content.trim() || isPending}>
            {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {initial ? 'Save changes' : 'Add knowledge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function BrandKnowledge() {
  const { brand } = useOutletContext<BrandContextData>();

  const knowledgeQuery = useBrandKnowledge(brand.id);
  const runsQuery = useAgentRuns(brand.id);
  const addKnowledge = useAddKnowledge(brand.id);
  const updateKnowledge = useUpdateKnowledge(brand.id);
  const retireKnowledge = useRetireKnowledge(brand.id);

  const [addOpen, setAddOpen] = useState(false);
  const [editing, setEditing] = useState<BrandKnowledgeEntry | null>(null);
  const [flagOpen, setFlagOpen] = useState(false);

  const entries = knowledgeQuery.data ?? [];
  const grouped = KIND_ORDER
    .map(kind => ({ kind, items: entries.filter(e => e.kind === kind) }))
    .filter(g => g.items.length > 0);
  // Anything with an unrecognized kind still gets shown, at the end.
  const otherEntries = entries.filter(e => !KIND_ORDER.includes(e.kind as KnowledgeKind));

  const handleAdd = async (input: KnowledgeEntryInput) => {
    try {
      await addKnowledge.mutateAsync(input);
      setAddOpen(false);
    } catch {
      toast.error('Failed to add knowledge');
    }
  };

  const handleUpdate = async (input: KnowledgeEntryInput) => {
    if (!editing) return;
    try {
      await updateKnowledge.mutateAsync({ id: editing.id, ...input });
      setEditing(null);
    } catch {
      toast.error('Failed to update knowledge');
    }
  };

  const handleRetire = async (entry: BrandKnowledgeEntry) => {
    if (!confirm(`Retire "${entry.title}"? Sendr will stop applying it.`)) return;
    try {
      await retireKnowledge.mutateAsync(entry.id);
    } catch {
      toast.error('Failed to retire knowledge');
    }
  };

  const renderEntryCard = (entry: BrandKnowledgeEntry) => (
    <div key={entry.id} className="rounded-xl border bg-card p-4 group">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="secondary" className="text-[10px]">
              {KNOWLEDGE_KIND_META[entry.kind as KnowledgeKind]?.label ?? entry.kind}
            </Badge>
            <span className="text-sm font-medium truncate">{entry.title}</span>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{entry.content}</p>
          <div className="flex items-center gap-3 pt-1 text-xs text-muted-foreground">
            <ConfidenceDots value={entry.confidence} />
            {entry.valid_until && (
              <span>expires {format(new Date(entry.valid_until), 'MMM d')}</span>
            )}
            <span>{entry.source === 'manual' ? 'added manually' : 'learned from your corrections'}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditing(entry)} title="Edit">
            <Pencil className="w-3.5 h-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
            onClick={() => handleRetire(entry)}
            title="Retire"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Page actions */}
      <div className="flex items-center justify-end">
        <Button variant="outline" size="sm" onClick={() => setFlagOpen(true)}>
          <Flag className="w-3.5 h-3.5 mr-2" />
          Flag a mistake
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: What Sendr knows */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">What Sendr knows</h2>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus className="w-3.5 h-3.5 mr-2" />
              Add knowledge
            </Button>
          </div>

          {knowledgeQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-24 w-full rounded-xl" />
            </div>
          ) : knowledgeQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between gap-4">
                <span>Couldn't load brand knowledge.</span>
                <Button variant="outline" size="sm" onClick={() => knowledgeQuery.refetch()}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : entries.length === 0 ? (
            <div className="rounded-xl border bg-card p-8 text-center space-y-3">
              <Brain className="w-8 h-8 mx-auto text-muted-foreground/50" />
              <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                Sendr hasn't learned anything about this brand yet — it learns every time you
                correct a link, edit copy, or flag a mistake.
              </p>
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="w-3.5 h-3.5 mr-2" />
                Add knowledge
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              {grouped.map(({ kind, items }) => (
                <div key={kind} className="space-y-2">
                  <h3 className="text-xs text-muted-foreground">
                    {KNOWLEDGE_KIND_META[kind].label}
                    <span className="mx-1.5">·</span>
                    {KNOWLEDGE_KIND_META[kind].description}
                  </h3>
                  <div className="space-y-2">{items.map(renderEntryCard)}</div>
                </div>
              ))}
              {otherEntries.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs text-muted-foreground">Other</h3>
                  <div className="space-y-2">{otherEntries.map(renderEntryCard)}</div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Activity */}
        <div className="space-y-4">
          <h2 className="text-sm font-medium">Activity</h2>

          {runsQuery.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
              <Skeleton className="h-12 w-full rounded-xl" />
            </div>
          ) : runsQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between gap-4">
                <span>Couldn't load activity.</span>
                <Button variant="outline" size="sm" onClick={() => runsQuery.refetch()}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : (runsQuery.data ?? []).length === 0 ? (
            <div className="rounded-xl border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Sendr's agents check links, expire stale promos, and learn from your edits —
                autonomously. Their work shows up here.
              </p>
            </div>
          ) : (
            <div className="rounded-xl border bg-card divide-y">
              {(runsQuery.data ?? []).map(run => {
                const meta = AGENT_META[run.agent as AgentKind];
                const Icon = meta?.icon;
                return (
                  <div key={run.id} className="p-3 flex items-start gap-2.5">
                    {meta && Icon ? (
                      <span className={cn('mt-0.5 inline-flex items-center justify-center w-6 h-6 rounded-md border shrink-0', meta.badgeClass)}>
                        <Icon className="w-3.5 h-3.5" />
                      </span>
                    ) : (
                      <span className="mt-0.5 w-6 h-6 rounded-md border bg-muted shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{meta?.label ?? run.agent}</p>
                      <p className="text-sm leading-snug">{run.headline || 'Run completed'}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                        <span className="mx-1">·</span>
                        {run.trigger}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Add dialog */}
      {addOpen && (
        <KnowledgeDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onSubmit={handleAdd}
          isPending={addKnowledge.isPending}
        />
      )}

      {/* Edit dialog (keyed remount so fields initialize from the entry) */}
      {editing && (
        <KnowledgeDialog
          key={editing.id}
          open={!!editing}
          onOpenChange={(open) => { if (!open) setEditing(null); }}
          initial={editing}
          onSubmit={handleUpdate}
          isPending={updateKnowledge.isPending}
        />
      )}

      <FlagMistakeDialog
        brandId={brand.id}
        open={flagOpen}
        onOpenChange={setFlagOpen}
      />
    </div>
  );
}
