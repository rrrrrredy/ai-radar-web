-- Existing public access is column-scoped. Preserve that boundary.
grant select (title_zh) on public.radar_items to anon, authenticated;
