-- Kinderverein Projektzentrale
-- Einmal im Supabase SQL Editor ausführen.

create table if not exists public.project_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid null default auth.uid()
);

alter table public.project_state enable row level security;

-- Die Projektseite ist für angemeldete Teammitglieder gedacht.
-- Empfohlen: In Supabase Auth öffentliche Registrierungen deaktivieren
-- und Mitglieder nur per Einladung freischalten.
create policy "authenticated can read project"
on public.project_state
for select
to authenticated
using (true);

create policy "authenticated can create project"
on public.project_state
for insert
to authenticated
with check (true);

create policy "authenticated can update project"
on public.project_state
for update
to authenticated
using (true)
with check (true);

-- Realtime aktivieren. Falls die Tabelle bereits in der Publication ist,
-- kann dieser Befehl mit einem Hinweis abbrechen und ignoriert werden.
alter publication supabase_realtime add table public.project_state;
