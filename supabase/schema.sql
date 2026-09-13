-- Kinderverein Projektzentrale
-- Einmal im Supabase SQL Editor ausführen.
-- Das Supabase-Projekt sollte ausschließlich für diese interne Projektplattform genutzt werden.

create table if not exists public.project_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid null default auth.uid()
);

alter table public.project_state enable row level security;

-- Anonyme Browser erhalten ausdrücklich keinen Tabellenzugriff.
revoke all on table public.project_state from anon;

-- Angemeldete Teamkonten dürfen den gemeinsamen Projektstand lesen und bearbeiten.
grant select, insert, update on table public.project_state to authenticated;

create policy "authenticated can read project"
on public.project_state
for select
to authenticated
using (auth.uid() is not null);

create policy "authenticated can create project"
on public.project_state
for insert
to authenticated
with check (auth.uid() is not null);

create policy "authenticated can update project"
on public.project_state
for update
to authenticated
using (auth.uid() is not null)
with check (auth.uid() is not null);

-- Bei jeder Änderung Zeit und Benutzer protokollieren.
create or replace function public.set_project_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

drop trigger if exists set_project_audit_fields on public.project_state;
create trigger set_project_audit_fields
before insert or update on public.project_state
for each row execute function public.set_project_audit_fields();

-- Realtime aktivieren. Falls die Tabelle bereits in der Publication ist,
-- kann dieser Befehl mit dem Hinweis "already member" abbrechen und dann ignoriert werden.
alter publication supabase_realtime add table public.project_state;
