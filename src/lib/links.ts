/** A slice "link" that isn't a real destination (placeholder '#', empty,
 *  javascript:) — treat as unlinked everywhere: counts, pills, QA. */
export function isRealLink(link: string | null | undefined): link is string {
  if (!link) return false;
  const l = link.trim();
  return l.length > 0 && l !== '#' && !l.startsWith('javascript:') && l !== 'about:blank';
}
