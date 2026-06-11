# Sendr Design Spec

The contract for all UI work. Goal: a focused production tool that feels like
Linear/Vercel-grade software — calm, fast, information-dense without clutter.
No feature bloat: every screen serves the pipeline (design in → reviewed →
in Klaviyo) or the knowledge layer that makes it smarter.

## Identity

- Name: **Sendr**. Accent: the existing orange (`--primary`, #f5862f family).
  Use accent for primary actions and progress only — never for decoration.
- Tone of copy: direct, marketer-friendly, zero dev jargon. "Klaviyo key",
  not "API credential". Sentence case everywhere (buttons, titles, labels).

## Layout system

- One persistent app shell for ALL authenticated routes: left sidebar
  (collapsible, icons + labels) + topbar (page title, brand switcher when the
  page is brand-scoped, user menu). No page renders outside the shell except
  /auth.
- Content container: `max-w-6xl mx-auto px-4 md:px-8 py-6`. Dense pages
  (queue) may go full-width but keep the same padding rhythm.
- Spacing scale: 4/8/12/16/24/32. Cards: `rounded-xl border bg-card`,
  no shadows heavier than `shadow-sm`.
- Typography: page title `text-xl font-semibold tracking-tight`; section
  `text-sm font-medium text-muted-foreground uppercase tracking-wide` is NOT
  allowed (no shouty labels) — use `text-sm font-medium`; body `text-sm`;
  metadata `text-xs text-muted-foreground`.

## Sidebar nav (final IA)

1. Queue (home, `/queue`)
2. Brands (`/brands`) → brand detail tabs: Overview · Knowledge · Links ·
   Email (footer) · Integrations
3. Segments (`/segments`)
4. Settings (`/settings` — profile, plugin tokens, ClickUp)

Nothing else. Legacy routes redirect.

## State patterns (mandatory on every data view)

- **Loading**: skeletons matching final layout (`<Skeleton/>`), never
  full-page spinners.
- **Empty**: icon + one-line explanation + one primary action. Empty states
  teach the next step ("No campaigns yet — send a frame from Figma or upload
  a design").
- **Error**: inline `destructive` alert with retry; never a blank screen,
  never a raw error string from the server.
- Mutations: optimistic where safe, `sonner` toast on failure only (success
  toasts only for actions whose result isn't visible on screen).

## Components

- shadcn/ui primitives only; no new dependencies without strong reason.
- Tables for dense data, cards for objects with identity (brands, lessons).
- Badges: severity colors — error `destructive`, warning `amber`, info
  `secondary`. Agent badges: learn=violet, qa=blue, refresh=emerald — defined
  once in `src/lib/agentMeta.ts`, imported everywhere.
- Dialogs need `DialogTitle` (a11y warning exists today — fix on touch).

## Performance

- All routes lazy (`React.lazy` + suspense fallback skeleton) from App.tsx.
- TanStack Query: `staleTime` 30s default; brand list 5 min; realtime
  subscription only on queue page.
- No barrel imports of lucide; import icons individually.

## Voice of the knowledge layer

The agents are presented as one assistant ("Brand memory"), not three robots.
Activity feed entries read like a colleague's standup notes: "Verified 40
links (2 dead)". Lessons display as editable cards with kind, confidence
shown as subtle dots (not percentages), and expiry when present.
