-- Add 'completed' status to pvp_challenges table
-- This allows tracking when a challenge has been resolved with a match completion

-- First, update the constraint to include 'completed'
alter table public.pvp_challenges
  drop constraint pvp_challenges_status_check;

alter table public.pvp_challenges
  add constraint pvp_challenges_status_check 
  check (status in ('pending', 'accepted', 'declined', 'cancelled', 'expired', 'completed'));
