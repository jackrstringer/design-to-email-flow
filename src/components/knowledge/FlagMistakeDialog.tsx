import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const MISTAKE_CATEGORIES = [
  { value: 'wrong_link', label: 'Wrong link' },
  { value: 'wrong_alt_text', label: 'Wrong alt text' },
  { value: 'wrong_copy', label: 'Wrong copy' },
  { value: 'wrong_slicing', label: 'Wrong slicing' },
  { value: 'wrong_subject_line', label: 'Wrong subject line' },
  { value: 'other', label: 'Other' },
] as const;

interface FlagMistakeDialogProps {
  brandId: string;
  queueId?: string;
  defaultContext?: Record<string, unknown>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FlagMistakeDialog({ brandId, queueId, defaultContext, open, onOpenChange }: FlagMistakeDialogProps) {
  const [category, setCategory] = useState<string>('');
  const [description, setDescription] = useState('');
  const [expected, setExpected] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setCategory('');
    setDescription('');
    setExpected('');
  };

  const handleSubmit = async () => {
    if (!category || !description.trim()) return;
    setIsSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from('knowledge_events').insert({
        brand_id: brandId,
        user_id: user?.id ?? null,
        queue_id: queueId ?? null,
        event_type: 'error_flagged',
        before: defaultContext ? JSON.parse(JSON.stringify(defaultContext)) : null,
        after: {
          category,
          description: description.trim(),
          expected: expected.trim() || null,
        },
      });
      if (error) throw error;

      // Fire-and-forget: nudge the learning agent to process this right away.
      supabase.functions
        .invoke('brand-agent-learn', { body: { brandId, queueId, trigger: 'manual' } })
        .catch(() => { /* best-effort */ });

      toast.success('Flagged — Sendr will learn from this.');
      reset();
      onOpenChange(false);
    } catch (err) {
      console.error('Failed to flag mistake:', err);
      toast.error('Failed to flag the mistake. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!isSubmitting) onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Flag a mistake</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Tell Sendr what it got wrong so it doesn't happen again.
          </p>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">What kind of mistake?</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a category..." />
              </SelectTrigger>
              <SelectContent>
                {MISTAKE_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">What happened?</label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. The hero CTA pointed to the homepage instead of the sale collection"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">
              What should it have been? <span className="text-muted-foreground font-normal">(optional)</span>
            </label>
            <Textarea
              value={expected}
              onChange={(e) => setExpected(e.target.value)}
              placeholder="e.g. Hero images should always link to /collections/sale"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!category || !description.trim() || isSubmitting}>
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Flag mistake
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
