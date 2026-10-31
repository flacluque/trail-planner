-- Ravitime : comptes et sauvegarde de « Mes courses » (à exécuter une fois dans Supabase › SQL Editor).
-- Chaque coureur ne voit et ne modifie que ses propres lignes (Row Level Security). Rien de ce qui vient de Strava
-- n'est gardé ici : ni références importées, ni profil de coureur, ni retours de course.

-- Une course : sa saisie (roadbook), son résumé, son sac et son assistance. `deleted_at` garde la trace d'une course
-- supprimée, pour l'effacer aussi sur les autres appareils.
create table if not exists public.races (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  data jsonb not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

-- Réglages communs à toutes les courses : références saisies à la main, nutrition, montre, préparation.
create table if not exists public.settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.races enable row level security;
alter table public.settings enable row level security;

drop policy if exists "ses courses" on public.races;
create policy "ses courses" on public.races for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "ses réglages" on public.settings;
create policy "ses réglages" on public.settings for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Traces GPX : un dossier par coureur (« <id du coureur>/<id de la course>.gpx »), privé.
insert into storage.buckets (id, name, public, file_size_limit)
values ('traces', 'traces', false, 20971520)
on conflict (id) do nothing;

drop policy if exists "ses traces" on storage.objects;
create policy "ses traces" on storage.objects for all to authenticated
  using (bucket_id = 'traces' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'traces' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Suppression du compte par le coureur lui-même : ses courses et réglages partent avec (on delete cascade). Ses
-- traces sont effacées par l'appli juste avant.
create or replace function public.delete_my_account() returns void
language sql security definer set search_path = '' as $$
  delete from auth.users where id = auth.uid();
$$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
