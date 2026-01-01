-- Enable Supabase Realtime for PvP tables.
-- Without adding tables to the `supabase_realtime` publication, clients will not receive `postgres_changes` events.

DO $$
BEGIN
  -- pvp_challenges
  IF to_regclass('public.pvp_challenges') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.pvp_challenges REPLICA IDENTITY FULL;
    EXCEPTION
      WHEN undefined_table THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_challenges;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
      WHEN insufficient_privilege THEN NULL;
    END;
  END IF;

  -- Optional: pvp_matches (if used elsewhere)
  IF to_regclass('public.pvp_matches') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.pvp_matches REPLICA IDENTITY FULL;
    EXCEPTION
      WHEN undefined_table THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.pvp_matches;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
      WHEN insufficient_privilege THEN NULL;
    END;
  END IF;

  -- Optional: matches / match_participants (older flow in this repo)
  IF to_regclass('public.matches') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.matches REPLICA IDENTITY FULL;
    EXCEPTION
      WHEN undefined_table THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
      WHEN insufficient_privilege THEN NULL;
    END;
  END IF;

  IF to_regclass('public.match_participants') IS NOT NULL THEN
    BEGIN
      ALTER TABLE public.match_participants REPLICA IDENTITY FULL;
    EXCEPTION
      WHEN undefined_table THEN NULL;
    END;

    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.match_participants;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
      WHEN undefined_object THEN NULL;
      WHEN insufficient_privilege THEN NULL;
    END;
  END IF;
END $$;
