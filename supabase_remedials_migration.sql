-- ══════════════════════════════════════════════════════════════════════════════
-- Fire Door Remedials — Supabase Migration
-- Run this in the Supabase SQL Editor (Dashboard → SQL → New query)
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. Create remedials table ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS remedials (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Links to existing data
  inspection_id              UUID NOT NULL REFERENCES inspections(id) ON DELETE CASCADE,
  project_id                 UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  door_asset_id              TEXT,

  -- Assignment
  joiner_id                  UUID REFERENCES auth.users(id),
  joiner_name                TEXT,

  -- Status workflow: pending → in_progress → completed | closed
  status                     TEXT NOT NULL DEFAULT 'pending'
                             CHECK (status IN ('pending', 'in_progress', 'completed', 'closed')),

  -- What needs doing (snapshot from inspection at creation time)
  recommended_action         TEXT,
  recommended_repair_actions TEXT,
  description                TEXT,

  -- Before / after photo evidence
  before_photo_urls          TEXT[],
  after_photo_urls           TEXT[],

  -- Completion
  completion_notes           TEXT,
  completed_at               TIMESTAMPTZ,
  completed_by               UUID REFERENCES auth.users(id),

  -- Closure (when TFJ isn't doing the work)
  closed_reason              TEXT,
  closed_at                  TIMESTAMPTZ,
  closed_by                  UUID REFERENCES auth.users(id),

  -- Timestamps
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ─── 2. Indexes ──────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_remedials_project_id    ON remedials(project_id);
CREATE INDEX IF NOT EXISTS idx_remedials_status        ON remedials(status);
CREATE INDEX IF NOT EXISTS idx_remedials_joiner_id     ON remedials(joiner_id);
CREATE INDEX IF NOT EXISTS idx_remedials_door_asset_id ON remedials(door_asset_id);
CREATE INDEX IF NOT EXISTS idx_remedials_inspection_id ON remedials(inspection_id);

-- ─── 3. Row Level Security ───────────────────────────────────────────────────

ALTER TABLE remedials ENABLE ROW LEVEL SECURITY;

-- Portal users (admin / user) — full CRUD
CREATE POLICY "Portal users full access"
  ON remedials FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE id = auth.uid() AND role IN ('admin', 'user')
    )
  );

-- Joiners — read their assigned remedials
CREATE POLICY "Joiners read own"
  ON remedials FOR SELECT
  USING (joiner_id = auth.uid());

-- Joiners — update their assigned remedials (status, photos, notes)
CREATE POLICY "Joiners update own"
  ON remedials FOR UPDATE
  USING (joiner_id = auth.uid())
  WITH CHECK (joiner_id = auth.uid());

-- ─── 4. Auto-create trigger ─────────────────────────────────────────────────
-- When an inspection is inserted with Fail + Repair, auto-create a remedial

CREATE OR REPLACE FUNCTION create_remedial_on_fail()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.inspection_passed = 'Fail'
     AND NEW.recommended_action ILIKE '%repair%' THEN
    INSERT INTO remedials (
      inspection_id,
      project_id,
      door_asset_id,
      recommended_action,
      recommended_repair_actions
    ) VALUES (
      NEW.id,
      NEW.project_id,
      NEW.door_asset_id,
      NEW.recommended_action,
      NEW.recommended_repair_actions
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_create_remedial ON inspections;
CREATE TRIGGER trg_create_remedial
  AFTER INSERT ON inspections
  FOR EACH ROW EXECUTE FUNCTION create_remedial_on_fail();

-- ─── 5. Updated_at auto-update ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_remedials_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_remedials_updated_at ON remedials;
CREATE TRIGGER trg_remedials_updated_at
  BEFORE UPDATE ON remedials
  FOR EACH ROW EXECUTE FUNCTION update_remedials_updated_at();

-- ─── 6. Backfill existing data ───────────────────────────────────────────────

-- 6a. Unactioned failed inspections → pending remedials
INSERT INTO remedials (
  inspection_id, project_id, door_asset_id,
  recommended_action, recommended_repair_actions,
  status, created_at
)
SELECT
  id, project_id, door_asset_id,
  recommended_action, recommended_repair_actions,
  'pending', created_at
FROM inspections
WHERE inspection_passed = 'Fail'
  AND recommended_action ILIKE '%repair%'
  AND (remedial_actioned IS NULL OR remedial_actioned = false)
ON CONFLICT DO NOTHING;

-- 6b. Already-actioned failed inspections → completed remedials
INSERT INTO remedials (
  inspection_id, project_id, door_asset_id,
  recommended_action, recommended_repair_actions,
  status, completed_at, completion_notes, created_at
)
SELECT
  id, project_id, door_asset_id,
  recommended_action, recommended_repair_actions,
  'completed', remedial_actioned_at, remedial_action_note, created_at
FROM inspections
WHERE inspection_passed = 'Fail'
  AND recommended_action ILIKE '%repair%'
  AND remedial_actioned = true
ON CONFLICT DO NOTHING;

-- ─── 7. Enable Realtime ──────────────────────────────────────────────────────
-- NOTE: You also need to enable Realtime for the remedials table in the
-- Supabase dashboard: Database → Replication → Add table → remedials

ALTER PUBLICATION supabase_realtime ADD TABLE remedials;

-- ══════════════════════════════════════════════════════════════════════════════
-- MANUAL STEPS (do these in the Supabase dashboard after running this SQL):
--
-- 1. Storage → Create bucket "remedial-photos" (public)
-- 2. If user_profiles.role has a CHECK constraint, run:
--    ALTER TABLE user_profiles DROP CONSTRAINT <constraint_name>;
--    ALTER TABLE user_profiles ADD CONSTRAINT user_profiles_role_check
--      CHECK (role IN ('admin', 'user', 'inspector', 'client', 'joiner'));
--    (Check constraint name with: SELECT constraint_name FROM information_schema.table_constraints
--     WHERE table_name = 'user_profiles' AND constraint_type = 'CHECK';)
--
-- 3. Verify with: SELECT status, count(*) FROM remedials GROUP BY status;
-- ══════════════════════════════════════════════════════════════════════════════
