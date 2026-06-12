// Campaign naming conventions. A template is a plain string with tokens:
//   {brand}        → brand name
//   {name}         → the campaign's own name (e.g. the Figma frame name)
//   {date:FMT}     → date formatted with MM, DD, YYYY, YY, M, D (e.g. {date:MM.DD})
//   {month}        → short month name (e.g. Jun)
//   {year}         → 4-digit year
//
// NOTE: formatCampaignName is duplicated inline in
// supabase/functions/process-campaign-queue/index.ts (Deno can't import from
// src/). Keep both copies in sync.

export interface CampaignNameParts {
  brand: string;
  name: string;
  date?: Date;
}

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateToken(fmt: string, d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = String(d.getFullYear());
  return fmt
    .replace(/YYYY/g, yyyy)
    .replace(/YY/g, yyyy.slice(2))
    .replace(/MM/g, mm)
    .replace(/DD/g, dd)
    .replace(/M(?![M])/g, String(d.getMonth() + 1))
    .replace(/D(?![D])/g, String(d.getDate()));
}

export function formatCampaignName(
  template: string,
  parts: CampaignNameParts,
): string {
  const d = parts.date ?? new Date();
  return template
    .replace(/\{brand\}/gi, parts.brand)
    .replace(/\{name\}/gi, parts.name)
    .replace(/\{date:([^}]+)\}/gi, (_, fmt: string) => formatDateToken(fmt, d))
    .replace(/\{month\}/gi, MONTHS_SHORT[d.getMonth()])
    .replace(/\{year\}/gi, String(d.getFullYear()))
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/** Curated starting points shown on the brand page. All editable. */
export const NAMING_PRESETS: Array<{ label: string; template: string }> = [
  { label: 'Brand — Name', template: '{brand} - {name}' },
  { label: 'Brand | Date | Name', template: '{brand} | {date:MM.DD} | {name}' },
  { label: 'Date — Brand — Name', template: '{date:MM.DD.YY} - {brand} - {name}' },
  { label: 'Brand / Month / Name', template: '{brand} / {month} {year} / {name}' },
  { label: 'RW | Brand | Name', template: 'RW | {brand} | {name}' },
];
