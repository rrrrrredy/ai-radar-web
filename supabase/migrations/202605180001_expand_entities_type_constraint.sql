alter table public.entities
  drop constraint if exists entities_type_check;

alter table public.entities
  add constraint entities_type_check check (
    type in ('company', 'person', 'model', 'product', 'paper', 'project', 'repository', 'investor', 'regulator', 'other')
  );
