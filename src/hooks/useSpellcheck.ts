// Copy QA for subject lines / preview text.
//
// Two layers, merged:
//   1. Local nspell (Hunspell en dictionary) — lazy-loaded out of the main
//      bundle, debounced ~250ms. Instant red-outline feedback.
//   2. check-copy-grammar edge function (Claude) — debounced ~800ms after the
//      saved value settles. Catches real grammar mistakes nspell can't see.
//      Results are cached per (text, dictionary) so re-renders are free.
//
// Both layers respect the per-brand custom dictionary plus the brand's own
// name/domain words, which are always-valid without being stored.

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CopyIssue {
  kind: 'spelling' | 'grammar';
  /** The flagged token as it appears in the text. */
  word: string;
  /** Character index of the token in the checked text (-1 for grammar issues without a token). */
  index: number;
  /** Human-readable explanation (grammar issues; spelling gets a default). */
  message?: string;
}

// ── Local speller (nspell), lazy singleton ──────────────────────────────────

interface Speller {
  correct: (word: string) => boolean;
}

let spellerPromise: Promise<Speller> | null = null;
let loadedSpeller: Speller | null = null;

function loadSpeller(): Promise<Speller> {
  if (!spellerPromise) {
    spellerPromise = (async () => {
      // Dynamic imports keep nspell + the 540KB dictionary out of the main
      // bundle. Relative ?raw imports bypass the package "exports" map
      // (dictionary-en's index.js reads via node:fs, which won't run in the
      // browser).
      const [nspellMod, aff, dic] = await Promise.all([
        import('nspell'),
        import('../../node_modules/dictionary-en/index.aff?raw'),
        import('../../node_modules/dictionary-en/index.dic?raw'),
      ]);
      const nspell = nspellMod.default;
      const speller = nspell(aff.default, dic.default) as Speller;
      loadedSpeller = speller;
      return speller;
    })();
  }
  return spellerPromise;
}

// ── Tokenization & rules ─────────────────────────────────────────────────────

/** Normalize smart quotes/dashes so tokens match dictionary forms. */
export function normalizeCopy(text: string): string {
  return text
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-');
}

const URL_LIKE =
  /(?:https?:\/\/\S+|www\.\S+|\S+\.(?:com|net|org|io|co|so|shop|store|app|ai|us|uk|ca)(?:\/\S*)?)/gi;

/** Splits a brand name/domain into always-valid lowercase word tokens. */
export function brandWordSet(brandName?: string | null, brandDomain?: string | null): Set<string> {
  const words = new Set<string>();
  const add = (raw: string) => {
    for (const part of raw.split(/[^a-zA-Z]+/)) {
      if (part.length > 1) words.add(part.toLowerCase());
    }
  };
  if (brandName) add(brandName);
  if (brandDomain) add(brandDomain);
  return words;
}

function isCustomWord(token: string, custom: Set<string>): boolean {
  const lower = token.toLowerCase();
  if (custom.has(lower)) return true;
  // Possessive / simple plural of a custom word is also fine.
  const stripped = lower.replace(/'s$|s'$|'$/, '');
  if (stripped !== lower && custom.has(stripped)) return true;
  if (lower.endsWith('s') && custom.has(lower.slice(0, -1))) return true;
  return false;
}

/**
 * Spellcheck a single text against the loaded dictionary + custom words.
 * Synchronous — returns [] until the speller has loaded (call loadSpeller()
 * or use the useSpellcheck hook to trigger loading).
 */
export function checkText(text: string | null | undefined, customWords: Iterable<string>): CopyIssue[] {
  if (!text || !loadedSpeller) return [];
  const speller = loadedSpeller;
  const custom = new Set<string>();
  for (const w of customWords) custom.add(w.toLowerCase());

  const normalized = normalizeCopy(text);
  // Blank out URL-like spans (preserve indices).
  const scrubbed = normalized.replace(URL_LIKE, (m) => ' '.repeat(m.length));

  const issues: CopyIssue[] = [];
  const tokenRe = /[A-Za-z][A-Za-z'-]*/g;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(scrubbed)) !== null) {
    const raw = match[0].replace(/^['-]+|['-]+$/g, '');
    if (raw.length < 2) continue;
    const index = match.index + match[0].indexOf(raw);

    // Skip if adjacent to digits (SKU/promo codes like SAVE20 are caught by
    // the ALL-CAPS rule; mixed tokens like 4th/2x are not letter-led anyway).
    const after = scrubbed[match.index + match[0].length];
    if (after && /\d/.test(after)) continue;

    // ALL-CAPS tokens (acronyms, promo codes) are exempt.
    if (raw === raw.toUpperCase()) continue;
    if (isCustomWord(raw, custom)) continue;

    // Strip possessives before dictionary lookup.
    const base = raw.replace(/'s$|s'$|'$/i, '');

    // Hyphenated words: valid when every part is valid.
    const parts = base.split('-').filter(Boolean);
    const ok = parts.every((part) => {
      if (part.length < 2) return true;
      if (part === part.toUpperCase()) return true;
      if (isCustomWord(part, custom)) return true;
      return speller.correct(part) || speller.correct(part.toLowerCase());
    });
    if (!ok) {
      issues.push({ kind: 'spelling', word: raw, index, message: `"${raw}" looks misspelled` });
    }
  }
  return issues;
}

/** Loads the local speller and exposes the synchronous checkText. */
export function useSpellcheck() {
  const [ready, setReady] = useState(loadedSpeller !== null);
  useEffect(() => {
    let cancelled = false;
    loadSpeller().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return { ready, checkText };
}

// ── Grammar layer (check-copy-grammar edge function) ─────────────────────────

interface GrammarIssue {
  kind: 'spelling' | 'grammar';
  token: string;
  message: string;
}

// Module-level cache: identical text + dictionary never hits the LLM twice.
const grammarCache = new Map<string, GrammarIssue[]>();
const grammarInFlight = new Map<string, Promise<GrammarIssue[]>>();

async function fetchGrammar(texts: string[], dictionary: string[]): Promise<GrammarIssue[][]> {
  const dictKey = [...dictionary].sort().join('');
  const missing = texts.filter(
    (t) => !grammarCache.has(`${dictKey}${t}`) && !grammarInFlight.has(`${dictKey}${t}`),
  );

  if (missing.length > 0) {
    const promise = supabase.functions
      .invoke('check-copy-grammar', { body: { texts: missing, dictionary } })
      .then(({ data, error }) => {
        if (error || !data?.results) throw error ?? new Error('No results');
        return (data.results as Array<{ issues: GrammarIssue[] }>).map((r) => r.issues ?? []);
      });
    missing.forEach((t, i) => {
      const key = `${dictKey}${t}`;
      const single = promise
        .then((all) => {
          grammarCache.set(key, all[i] ?? []);
          return all[i] ?? [];
        })
        .catch(() => [] as GrammarIssue[]) // fail open — never block on LLM errors
        .finally(() => grammarInFlight.delete(key));
      grammarInFlight.set(key, single);
    });
  }

  return Promise.all(
    texts.map((t) => {
      const key = `${dictKey}${t}`;
      const cached = grammarCache.get(key);
      if (cached) return Promise.resolve(cached);
      return grammarInFlight.get(key) ?? Promise.resolve([]);
    }),
  );
}

// ── Combined per-field QA ────────────────────────────────────────────────────

export interface CopyQaOptions {
  /** Stored custom dictionary words for the brand. */
  dictionary: string[];
  brandName?: string | null;
  brandDomain?: string | null;
  /**
   * When false (queue rows), the LLM grammar pass only runs for values the
   * user has edited this session — local spelling still runs immediately.
   * When true (expanded panel), grammar also runs once on mount.
   */
  grammarOnMount?: boolean;
  enabled?: boolean;
}

export interface CopyQaResult {
  /** Merged spelling+grammar issues per field key. */
  issuesByField: Record<string, CopyIssue[]>;
  hasIssues: boolean;
  /** All custom words considered valid (stored + brand-derived), lowercase. */
  effectiveWords: string[];
  /** Sync local-only check for live (mid-edit) feedback. */
  checkDraft: (text: string) => CopyIssue[];
}

const LOCAL_DEBOUNCE_MS = 250;
const GRAMMAR_DEBOUNCE_MS = 800;

/**
 * Validates a set of named text fields (e.g. { subject, preview }).
 * Local nspell results land ~250ms after a change; grammar results merge in
 * ~800ms after edits settle.
 */
export function useCopyQa(
  fields: Record<string, string | null | undefined>,
  options: CopyQaOptions,
): CopyQaResult {
  const { dictionary, brandName, brandDomain, grammarOnMount = false, enabled = true } = options;
  const { ready } = useSpellcheck();

  const effectiveWords = useMemo(() => {
    const set = brandWordSet(brandName, brandDomain);
    for (const w of dictionary) {
      if (w.trim()) set.add(w.trim().toLowerCase());
    }
    return [...set];
  }, [dictionary, brandName, brandDomain]);

  const [localIssues, setLocalIssues] = useState<Record<string, CopyIssue[]>>({});
  const [grammarIssues, setGrammarIssues] = useState<Record<string, CopyIssue[]>>({});

  const fieldKeys = Object.keys(fields).sort();
  const fieldsKey = fieldKeys.map((k) => `${k}${fields[k] ?? ''}`).join('');
  const wordsKey = effectiveWords.join('');

  // Track the first-seen value per field so queue rows only spend LLM calls
  // on values the user actually edited.
  const initialValues = useRef<Record<string, string>>({});
  for (const k of fieldKeys) {
    if (!(k in initialValues.current)) initialValues.current[k] = fields[k] ?? '';
  }

  // Local nspell pass — ~250ms debounce.
  useEffect(() => {
    if (!enabled || !ready) return;
    const timer = setTimeout(() => {
      const next: Record<string, CopyIssue[]> = {};
      for (const k of fieldKeys) {
        next[k] = checkText(fields[k], effectiveWords);
      }
      setLocalIssues(next);
    }, LOCAL_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldsKey, wordsKey, ready, enabled]);

  // Grammar pass — ~800ms after the saved values settle.
  useEffect(() => {
    if (!enabled) return;
    const candidates = fieldKeys.filter((k) => {
      const value = (fields[k] ?? '').trim();
      if (!value) return false;
      return grammarOnMount || value !== initialValues.current[k];
    });
    if (candidates.length === 0) return;

    let cancelled = false;
    const timer = setTimeout(async () => {
      const texts = candidates.map((k) => (fields[k] ?? '').trim());
      const results = await fetchGrammar(texts, effectiveWords);
      if (cancelled) return;
      setGrammarIssues((prev) => {
        const next = { ...prev };
        candidates.forEach((k, i) => {
          const value = fields[k] ?? '';
          next[k] = (results[i] ?? [])
            // Don't double-flag words the local speller (or the dictionary) already handles.
            .filter((iss) => iss.token && !isCustomWord(iss.token, new Set(effectiveWords)))
            .map((iss) => ({
              kind: iss.kind === 'spelling' ? 'spelling' : 'grammar',
              word: iss.token,
              index: normalizeCopy(value).indexOf(iss.token),
              message: iss.message,
            }));
        });
        return next;
      });
    }, GRAMMAR_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fieldsKey, wordsKey, enabled, grammarOnMount]);

  const issuesByField = useMemo(() => {
    const merged: Record<string, CopyIssue[]> = {};
    for (const k of fieldKeys) {
      const seen = new Set<string>();
      const all: CopyIssue[] = [];
      for (const issue of [...(localIssues[k] ?? []), ...(grammarIssues[k] ?? [])]) {
        const dedupeKey = `${issue.kind}:${issue.word.toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        // Re-validate against the latest dictionary so "Add to dictionary"
        // clears stale grammar/spelling entries instantly.
        if (issue.kind === 'spelling' && isCustomWord(issue.word, new Set(effectiveWords))) continue;
        seen.add(dedupeKey);
        all.push(issue);
      }
      merged[k] = all;
    }
    return merged;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localIssues, grammarIssues, wordsKey, fieldsKey]);

  const hasIssues = Object.values(issuesByField).some((list) => list.length > 0);

  return {
    issuesByField,
    hasIssues,
    effectiveWords,
    checkDraft: (text: string) => checkText(text, effectiveWords),
  };
}
