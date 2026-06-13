-- Per-brand favorite links (starred destinations, surfaced first in the link
-- picker / quick-swap) + a customizable brand avatar/tag color.
alter table public.brands add column if not exists favorite_links text[] not null default '{}';
alter table public.brands add column if not exists avatar_color text;

comment on column public.brands.favorite_links is 'URLs the team starred for this brand — shown first + flagged in the slice link picker and links popover.';
comment on column public.brands.avatar_color is 'Hex color for the brand avatar/tag chip (overrides the default). Null = default.';
