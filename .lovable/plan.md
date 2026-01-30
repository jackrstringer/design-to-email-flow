

# Brand Page with Section Navigation

## Overview
Transform the brand detail page from a single long scrolling page into a multi-screen experience with a submenu. Each section becomes its own route/screen, making navigation cleaner and content more focused.

---

## New Structure

```text
/brands/:id                   → Overview (compact branding + campaigns)
/brands/:id/links             → Link Intelligence
/brands/:id/email             → Email Components (Footers)
/brands/:id/integrations      → Integrations (Klaviyo, ClickUp)
```

---

## Visual Layout

```text
┌─────────────────────────────────────────────────────────────────────────┐
│  ← Back to Brands                                                       │
│                                                                         │
│  ┌──────┐  Brand Name                          [Re-analyze] [Delete]   │
│  │  B   │  domain.com                                                   │
│  └──────┘                                                               │
│                                                                         │
│  ┌────────────────────────────────────────────────────────────────────┐ │
│  │  Overview  │  Links  │  Email  │  Integrations                     │ │
│  └────────────────────────────────────────────────────────────────────┘ │
│                                                                         │
│  ═══════════════════════════════════════════════════════════════════════│
│                                                                         │
│                         [ Tab Content Here ]                            │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Screen Breakdown

### Overview Screen (`/brands/:id`)
**Compact branding section (decorative, not functional)**

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│  ┌── Brand Palette ─────────────────────────────────────────────────┐  │
│  │                                                                   │  │
│  │   [■][■][■][■]          [Dark Logo]    [Light Logo]              │  │
│  │   Primary Secondary      on white bg    on dark bg               │  │
│  │   Accent  Background                                              │  │
│  │                                                                   │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                                                         │
│  ─────────────────────────────────────────────────────────────────────  │
│                                                                         │
│  Campaigns (12)                                         [+ New Campaign]│
│                                                                         │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                                 │
│  │Campaign │  │Campaign │  │Campaign │  ...                            │
│  │  Card   │  │  Card   │  │  Card   │                                 │
│  └─────────┘  └─────────┘  └─────────┘                                 │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

**Compact branding:** Single card with color swatches in a row + two logo thumbnails. No edit functionality visible - just a visual reference. Clicking it could open edit modal if needed.

### Links Screen (`/brands/:id/links`)
Full Link Intelligence section with Link Preferences + Link Index table

### Email Screen (`/brands/:id/email`)  
Full Footers management section

### Integrations Screen (`/brands/:id/integrations`)
Klaviyo + ClickUp configuration cards

---

## Implementation Approach

### Option A: URL-based routing (Recommended)
- Each section is a real route: `/brands/:id`, `/brands/:id/links`, etc.
- Submenu links are actual `<NavLink>` elements
- Browser back/forward works naturally
- URL is shareable/bookmarkable
- Requires new routes in App.tsx and a layout wrapper

### Option B: Tab-based (same URL)
- Single route with tab state
- Faster switching (no route change)
- Less code changes
- URL doesn't reflect current section

**Proceeding with Option A** for better UX and shareability.

---

## Files to Create/Update

| File | Action |
|------|--------|
| `src/App.tsx` | Add new sub-routes for brands |
| `src/layouts/BrandLayout.tsx` | NEW - Wrapper with header + submenu |
| `src/pages/BrandDetail.tsx` | Refactor to be Overview screen only |
| `src/pages/BrandLinks.tsx` | NEW - Link Intelligence screen |
| `src/pages/BrandEmail.tsx` | NEW - Email/Footers screen |
| `src/pages/BrandIntegrations.tsx` | NEW - Integrations screen |
| `src/components/brand/BrandIdentityCompact.tsx` | NEW - Compact visual-only branding display |

---

## Technical Details

### New Routes in App.tsx

```tsx
<Route path="/brands/:id" element={<AuthGuard><AppLayout><BrandLayout /></AppLayout></AuthGuard>}>
  <Route index element={<BrandOverview />} />
  <Route path="links" element={<BrandLinks />} />
  <Route path="email" element={<BrandEmail />} />
  <Route path="integrations" element={<BrandIntegrations />} />
</Route>
```

### BrandLayout Component
Shared layout that wraps all brand sub-screens:
- Fetches brand data once
- Renders header with brand name, domain, actions
- Renders submenu/navigation tabs
- Renders `<Outlet />` for child route content
- Passes brand data via context or outlet context

### Submenu Navigation
Uses NavLink with active styling:

```tsx
const tabs = [
  { label: 'Overview', path: '' },
  { label: 'Links', path: 'links' },
  { label: 'Email', path: 'email' },
  { label: 'Integrations', path: 'integrations' },
];

<nav className="flex gap-1 border-b">
  {tabs.map(tab => (
    <NavLink
      key={tab.path}
      to={tab.path === '' ? `/brands/${id}` : `/brands/${id}/${tab.path}`}
      end={tab.path === ''}
      className={({ isActive }) => cn(
        "px-4 py-2 text-sm font-medium border-b-2 -mb-px",
        isActive 
          ? "border-primary text-foreground" 
          : "border-transparent text-muted-foreground hover:text-foreground"
      )}
    >
      {tab.label}
    </NavLink>
  ))}
</nav>
```

### Compact Brand Identity Card
Single-row visual display:

```tsx
<Card className="bg-muted/30">
  <CardContent className="p-4">
    <div className="flex items-center justify-between">
      {/* Color swatches row */}
      <div className="flex items-center gap-2">
        {colors.map(c => (
          <div 
            key={c.label}
            className="w-8 h-8 rounded-lg shadow-sm ring-1 ring-black/5" 
            style={{ backgroundColor: c.value }}
            title={c.label}
          />
        ))}
      </div>
      
      {/* Logo thumbnails */}
      <div className="flex items-center gap-3">
        {brand.darkLogoUrl && (
          <div className="h-10 px-3 bg-white rounded flex items-center">
            <img src={brand.darkLogoUrl} className="h-6 max-w-[80px] object-contain" />
          </div>
        )}
        {brand.lightLogoUrl && (
          <div className="h-10 px-3 bg-zinc-900 rounded flex items-center">
            <img src={brand.lightLogoUrl} className="h-6 max-w-[80px] object-contain" />
          </div>
        )}
      </div>
    </div>
  </CardContent>
</Card>
```

---

## Summary

1. Create `BrandLayout` component with shared header and submenu
2. Create `BrandIdentityCompact` for decorative color/logo display
3. Create new page components for each section
4. Update App.tsx with nested routes
5. Move data fetching logic to BrandLayout, pass to children via context

