// Brand custom dictionary manager — words the copy QA layer treats as
// always-correct spellings (brand names, product names, intentional
// stylings). Self-contained: fetches and mutates brands.custom_dictionary
// itself via useBrandDictionary, so it can be dropped onto the brand page
// with just a brandId.
//
// The brand's own name and domain are always valid automatically and are
// intentionally NOT stored or listed here.

import { useState } from 'react';
import { BookA, Plus, X } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBrandDictionary } from '@/hooks/useBrandDictionary';

interface DictionaryCardProps {
  brandId: string;
}

export function DictionaryCard({ brandId }: DictionaryCardProps) {
  const { words, brandName, isLoading, addWord, removeWord } = useBrandDictionary(brandId);
  const [newWord, setNewWord] = useState('');
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    const cleaned = newWord.trim();
    if (!cleaned || isAdding) return;
    setIsAdding(true);
    const ok = await addWord(cleaned);
    setIsAdding(false);
    if (ok) setNewWord('');
  };

  return (
    <Card>
      <CardContent className="p-6">
        <div className="mb-1 flex items-center gap-2">
          <BookA className="h-3.5 w-3.5 text-muted-foreground" />
          <h3 className="text-sm font-medium">Custom dictionary</h3>
        </div>
        <p className="mb-4 text-xs text-muted-foreground">
          Words spelling QA should always accept — product names, intentional spellings.
          {brandName ? ` “${brandName}” and your domain are always valid automatically.` : ''}
        </p>

        <div className="mb-3 flex items-center gap-2">
          <Input
            value={newWord}
            onChange={(e) => setNewWord(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleAdd();
              }
            }}
            placeholder="Add a word…"
            className="h-8 text-[13px]"
            disabled={isAdding}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-8 shrink-0 px-2.5 text-xs"
            onClick={handleAdd}
            disabled={!newWord.trim() || isAdding}
          >
            <Plus className="mr-1 h-3 w-3" />
            Add
          </Button>
        </div>

        {isLoading ? (
          <div className="flex flex-wrap gap-1.5">
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-24 rounded-full" />
            <Skeleton className="h-6 w-16 rounded-full" />
          </div>
        ) : words.length === 0 ? (
          <p className="text-[11px] italic text-muted-foreground/70">
            No custom words yet. You can also add words straight from flagged subject lines in the queue.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {words.map((word) => (
              <span
                key={word}
                className="inline-flex h-6 items-center gap-1 rounded-full bg-muted pl-2.5 pr-1 text-[11px] font-medium leading-none text-foreground/70"
              >
                {word}
                <button
                  type="button"
                  onClick={() => removeWord(word)}
                  className="rounded-full p-0.5 text-muted-foreground/70 transition-colors hover:bg-secondary hover:text-foreground"
                  aria-label={`Remove “${word}” from dictionary`}
                >
                  <X className="h-2.5 w-2.5" />
                </button>
              </span>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
