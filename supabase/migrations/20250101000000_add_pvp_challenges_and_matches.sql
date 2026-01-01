-- Create pvp_matches table for storing battle matches
create table if not exists public.pvp_matches (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references auth.users(id) on delete cascade,
  defender_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'preview' check (status in ('preview', 'in_progress', 'completed', 'cancelled')),
  winner_id uuid,
  challenger_board jsonb not null default '[]'::jsonb,
  defender_board jsonb not null default '[]'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists pvp_matches_challenger_id on public.pvp_matches(challenger_id);
create index if not exists pvp_matches_defender_id on public.pvp_matches(defender_id);
create index if not exists pvp_matches_status on public.pvp_matches(status);

-- Create pvp_challenges table for challenge flow
create table if not exists public.pvp_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references auth.users(id) on delete cascade,
  defender_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  match_id uuid references public.pvp_matches(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '10 minutes'),
  
  -- Prevent spam: only one pending challenge per challenger-defender pair
  unique(challenger_id, defender_id) where (status = 'pending')
);

create index if not exists pvp_challenges_defender_id_status on public.pvp_challenges(defender_id, status);
create index if not exists pvp_challenges_challenger_id_status on public.pvp_challenges(challenger_id, status);

-- Enable RLS
alter table public.pvp_matches enable row level security;
alter table public.pvp_challenges enable row level security;

-- pvp_matches RLS policies
create policy "Users can view matches they are in"
  on public.pvp_matches
  for select
  using (auth.uid() = challenger_id or auth.uid() = defender_id);

create policy "System can insert matches"
  on public.pvp_matches
  for insert
  with check (true);

create policy "Users can update their own matches"
  on public.pvp_matches
  for update
  using (auth.uid() = challenger_id or auth.uid() = defender_id);

-- pvp_challenges RLS policies
create policy "Users can view challenges involving them"
  on public.pvp_challenges
  for select
  using (auth.uid() = challenger_id or auth.uid() = defender_id);

create policy "Authenticated users can create challenges"
  on public.pvp_challenges
  for insert
  with check (auth.uid() = challenger_id);

create policy "Challenger can cancel pending challenges"
  on public.pvp_challenges
  for update
  using (auth.uid() = challenger_id and status = 'pending')
  with check (status = 'cancelled');

create policy "Defender can accept or decline pending challenges"
  on public.pvp_challenges
  for update
  using (auth.uid() = defender_id and status = 'pending')
  with check (status in ('accepted', 'declined'));

-- Optional: Add a view for public player profiles (if not already exists)
-- This allows clients to list available opponents safely
create or replace view public.player_profiles as
select 
  u.id,
  COALESCE(p.display_name, u.email) as display_name,
  p.current_credits,
  u.created_at
from auth.users u
left join public.players p on p.id = u.id;

-- Allow anyone to view the player_profiles view
create policy "Public can view all player profiles"
  on public.player_profiles
  for select
  using (true);
