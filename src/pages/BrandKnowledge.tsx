// Brand memory — the agent's wiki. Quiet, scannable reference of what Sendr
// knows (link rules first), with clarifying questions handled in a one-at-a-
// time survey dialog instead of cluttering the page. Activity is a whisper
// in the margin, not a feed.

import { useMemo, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
import { formatDistanceToNow, format } from 'date-fns';
import { Brain, Flag, Pencil, Plus, Trash2, Loader2, Telescope, MessageCircleQuestion } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
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

// Wiki section order — link behavior is the most operational knowledge.
const KIND_ORDER: KnowledgeKind[] = ['link_rule', 'promo', 'voice', 'style', 'product', 'mistake', 'fact'];

/* ── Add / edit dialog (unchanged behavior, compact) ─────────────────────── */

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
    await onSubmit({ kind, title: title.trim(), content: content.trim(), valid_until: validUntil || null });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit knowledge' : 'Add knowledge'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <Select value={kind} onValueChange={(v) => setKind(v as KnowledgeKind)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {KIND_ORDER.map((k) => (
                <SelectItem key={k} value={k}>{KNOWLEDGE_KIND_META[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title — e.g. Hero CTAs go to the sale collection" />
          <Textarea value={content} onChange={(e) => setContent(e.target.value)} placeholder="What should Sendr remember?" rows={4} />
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Expires</span>
            <Input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className="w-40" />
            <span className="text-xs text-muted-foreground">(optional, for promos)</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || !content.trim() || isPending}>
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {initial ? 'Save' : 'Add'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Survey dialog: clarifying questions, one at a time ──────────────────── */

function QuestionSurvey({
  questions,
  onClose,
  onAnswer,
  onSkip,
}: {
  questions: BrandKnowledgeEntry[];
  onClose: () => void;
  onAnswer: (q: BrandKnowledgeEntry, answer: string) => Promise<void>;
  onSkip: (q: BrandKnowledgeEntry) => Promise<void>;
}) {
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const q = questions[index];
  if (!q) return null;

  const advance = () => {
    setAnswer('');
    if (index + 1 < questions.length) setIndex(index + 1);
    else onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageCircleQuestion className="h-4 w-4 text-brand" />
            Quick question {questions.length > 1 ? `(${index + 1} of ${questions.length})` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm font-medium leading-snug">{q.title}</p>
          <p className="text-xs leading-relaxed text-muted-foreground">{q.content}</p>
          <Textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Your answer — Sendr remembers it permanently"
            rows={3}
            autoFocus
          />
        </div>
        <DialogFooter className="gap-2">
          <Button
            variant="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              await onSkip(q);
              setBusy(false);
              advance();
            }}
          >
            Dismiss
          </Button>
          <Button
            disabled={!answer.trim() || busy}
            onClick={async () => {
              setBusy(true);
              await onAnswer(q, answer.trim());
              setBusy(false);
              advance();
            }}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save answer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

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
  const [researching, setResearching] = useState(false);
  const [surveyOpen, setSurveyOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const entries = knowledgeQuery.data ?? [];
  const questions = useMemo(() => entries.filter((e) => e.kind === 'question'), [entries]);
  const wikiEntries = useMemo(() => entries.filter((e) => e.kind !== 'question'), [entries]);
  const grouped = KIND_ORDER
    .map((kind) => ({ kind, items: wikiEntries.filter((e) => e.kind === kind) }))
    .filter((g) => g.items.length > 0);
  const other = wikiEntries.filter((e) => !KIND_ORDER.includes(e.kind as KnowledgeKind));

  const handleResearch = async () => {
    setResearching(true);
    try {
      const { data, error } = await supabase.functions.invoke('brand-agent-research', {
        body: { brandId: brand.id, trigger: 'manual' },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      toast.success(
        data.campaigns === 0
          ? 'No sent campaigns found in Klaviyo yet'
          : `Studied ${data.campaigns} past campaigns`,
      );
      knowledgeQuery.refetch();
      runsQuery.refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Research failed');
    } finally {
      setResearching(false);
    }
  };

  const answerQuestion = async (q: BrandKnowledgeEntry, answer: string) => {
    try {
      await addKnowledge.mutateAsync({
        kind: 'fact',
        title: q.title,
        content: answer,
        valid_until: null,
      });
      await retireKnowledge.mutateAsync(q.id);
    } catch {
      toast.error('Failed to save answer');
    }
  };

  const skipQuestion = async (q: BrandKnowledgeEntry) => {
    try {
      await retireKnowledge.mutateAsync(q.id);
    } catch { /* non-fatal */ }
  };

  const handleRetire = async (entry: BrandKnowledgeEntry) => {
    if (!confirm(`Forget "${entry.title}"?`)) return;
    try {
      await retireKnowledge.mutateAsync(entry.id);
    } catch {
      toast.error('Failed to remove');
    }
  };

  return (
    <div className="space-y-4">
      {/* Questions banner — the only place questions appear */}
      {questions.length > 0 && (
        <button
          onClick={() => setSurveyOpen(true)}
          className="flex w-full items-center gap-3 rounded-lg border border-brand/25 bg-brand/[0.05] px-4 py-3 text-left transition-colors hover:bg-brand/[0.09]"
        >
          <MessageCircleQuestion className="h-4 w-4 shrink-0 text-brand" />
          <span className="flex-1 text-sm">
            <span className="font-medium">Sendr has {questions.length} quick question{questions.length === 1 ? '' : 's'} for you</span>
            <span className="ml-2 text-muted-foreground">— answers become permanent brand memory</span>
          </span>
          <span className="shrink-0 text-sm font-medium text-brand">Answer →</span>
        </button>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_240px]">
        {/* The wiki */}
        <div className="min-w-0 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Brand memory</h2>
              <p className="text-xs text-muted-foreground">
                Everything Sendr knows about {brand.name} — learned from your edits, its own research, and you.
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button variant="ghost" size="sm" onClick={handleResearch} disabled={researching} title="Study the brand's sent Klaviyo campaigns">
                {researching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Telescope className="h-3.5 w-3.5" />}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setFlagOpen(true)} title="Flag a mistake">
                <Flag className="h-3.5 w-3.5" />
              </Button>
              <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Add
              </Button>
            </div>
          </div>

          {knowledgeQuery.isLoading ? (
            <div className="space-y-2">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}
            </div>
          ) : knowledgeQuery.isError ? (
            <Alert variant="destructive">
              <AlertDescription className="flex items-center justify-between gap-4">
                <span>Couldn't load brand memory.</span>
                <Button variant="outline" size="sm" onClick={() => knowledgeQuery.refetch()}>Retry</Button>
              </AlertDescription>
            </Alert>
          ) : wikiEntries.length === 0 ? (
            <div className="rounded-lg border bg-card p-8 text-center">
              <Brain className="mx-auto h-7 w-7 text-muted-foreground/40" />
              <p className="mx-auto mt-3 max-w-sm text-sm text-muted-foreground">
                Nothing here yet. Sendr learns from every correction you make — or let it study
                the brand's past Klaviyo campaigns right now.
              </p>
              <Button size="sm" className="mt-4" onClick={handleResearch} disabled={researching}>
                {researching ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Telescope className="mr-2 h-3.5 w-3.5" />}
                Research this brand
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {[...grouped, ...(other.length ? [{ kind: 'fact' as KnowledgeKind, items: other }] : [])].map(({ kind, items }, gi) => (
                <section key={`${kind}-${gi}`}>
                  <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {KNOWLEDGE_KIND_META[kind]?.label ?? 'Other'}
                  </h3>
                  <div className="divide-y rounded-xl border bg-card shadow-card">
                    {items.map((entry) => {
                      const isOpen = expanded === entry.id;
                      return (
                        <div
                          key={entry.id}
                          className="group cursor-pointer px-3.5 py-2.5 transition-colors hover:bg-secondary/60"
                          onClick={() => setExpanded(isOpen ? null : entry.id)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-[13px] font-medium leading-snug">{entry.title}</p>
                              <p className={cn(
                                'mt-0.5 text-xs leading-relaxed text-muted-foreground whitespace-pre-wrap',
                                !isOpen && 'line-clamp-2',
                              )}>
                                {entry.content}
                              </p>
                              {isOpen && (
                                <p className="mt-1.5 text-[11px] text-muted-foreground/70">
                                  {entry.source === 'manual' ? 'Added by you' : entry.source === 'crawl' ? 'From Sendr research' : 'Learned from your corrections'}
                                  {entry.valid_until && ` · expires ${format(new Date(entry.valid_until), 'MMM d')}`}
                                </p>
                              )}
                            </div>
                            <div
                              className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => setEditing(entry)}>
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 hover:text-destructive" onClick={() => handleRetire(entry)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </div>

        {/* Activity — a whisper in the margin */}
        <aside className="space-y-2">
          <h3 className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Activity</h3>
          {runsQuery.isLoading ? (
            <Skeleton className="h-32 w-full rounded-lg" />
          ) : (
            <div className="space-y-2.5">
              {(runsQuery.data ?? []).slice(0, 10).map((run) => {
                const meta = AGENT_META[run.agent as AgentKind];
                const Icon = meta?.icon ?? Brain;
                return (
                  <div key={run.id} className="flex items-start gap-2" title={run.headline ?? ''}>
                    <Icon className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground/60" />
                    <div className="min-w-0">
                      <p className="truncate text-[11px] leading-snug text-muted-foreground">{run.headline}</p>
                      <p className="text-[10px] text-muted-foreground/60">
                        {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                );
              })}
              {(runsQuery.data ?? []).length === 0 && (
                <p className="px-1 text-[11px] text-muted-foreground/70">
                  Sendr's agents work in the background — link checks, learning, research. Their work shows here.
                </p>
              )}
            </div>
          )}
        </aside>
      </div>

      {/* Dialogs */}
      {addOpen && (
        <KnowledgeDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          onSubmit={async (input) => {
            try {
              await addKnowledge.mutateAsync(input);
              setAddOpen(false);
            } catch {
              toast.error('Failed to add');
            }
          }}
          isPending={addKnowledge.isPending}
        />
      )}
      {editing && (
        <KnowledgeDialog
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          initial={editing}
          onSubmit={async (input) => {
            try {
              await updateKnowledge.mutateAsync({ id: editing.id, ...input });
              setEditing(null);
            } catch {
              toast.error('Failed to update');
            }
          }}
          isPending={updateKnowledge.isPending}
        />
      )}
      {surveyOpen && questions.length > 0 && (
        <QuestionSurvey
          questions={questions}
          onClose={() => setSurveyOpen(false)}
          onAnswer={answerQuestion}
          onSkip={skipQuestion}
        />
      )}
      <FlagMistakeDialog
        open={flagOpen}
        onOpenChange={setFlagOpen}
        brandId={brand.id}
      />
    </div>
  );
}
