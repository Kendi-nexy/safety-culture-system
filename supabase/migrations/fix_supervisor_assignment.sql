-- ============================================
-- FIX: Assign real supervisor UUIDs to sites
-- ============================================
-- Root cause of "reports keep getting created unassigned":
-- your previous script ran
--     UPDATE public.sites SET supervisor_id = 'Supervisor' WHERE name = 'GLN';
-- but supervisor_id is a uuid FK into profiles(id). 'Supervisor' is a
-- full_name string, not a uuid, so that UPDATE errors out and
-- sites.supervisor_id never actually gets populated. With no
-- supervisor_id on the site, the assign_site_supervisor trigger has
-- nothing to assign, so every new report comes in with assigned_to = NULL.
--
-- This script fixes it by joining through profiles.email (unique,
-- reliable) to get the real uuid, then backfills any reports that were
-- already created while sites had no supervisor_id.

-- 1. MAP EACH SITE TO ITS SUPERVISOR BY EMAIL, THEN ASSIGN THE REAL UUID
--    Edit the (site_name, supervisor_email) pairs below to match your
--    actual sites — this reproduces the mapping from your last script.
WITH site_supervisor_map (site_name, supervisor_email) AS (
  VALUES
    ('GLN', 'supervisor@siginon.com'),
    ('AVN', 'supervisor2@siginon.com'),
    ('GHO', 'supervisor4@siginon.com'),
    ('SRL', 'supervisor5@siginon.com'),
    ('SPC', 'supervisor6@siginon.com'),
    ('GLM', 'supervisor7@siginon.com'),
    ('KLS', 'supervisor10@siginon.com'),
    ('CFS', 'supervisor8@siginon.com'),
    ('STZ', 'supervisor9@siginon.com')
)
UPDATE public.sites s
SET supervisor_id = p.id
FROM site_supervisor_map m
JOIN public.profiles p ON p.email = m.supervisor_email
WHERE LOWER(s.name) = LOWER(m.site_name);

-- 2. BACKFILL REPORTS THAT WERE CREATED WHILE SITES HAD NO SUPERVISOR
--    (the BEFORE INSERT trigger only fires on new inserts, so anything
--    logged before step 1 above is still sitting unassigned)
UPDATE public.reports r
SET assigned_to = s.supervisor_id
FROM public.sites s
WHERE LOWER(s.name) = LOWER(r.zone)
  AND r.assigned_to IS NULL
  AND s.supervisor_id IS NOT NULL;

-- 3. SANITY CHECK — every site should now show a supervisor
SELECT
  s.name AS site_name,
  s.supervisor_id,
  p.full_name AS supervisor_name,
  p.email AS supervisor_email
FROM public.sites s
LEFT JOIN public.profiles p ON s.supervisor_id = p.id
ORDER BY s.name;

-- 4. SANITY CHECK — should return 0 rows once everything is backfilled
SELECT r.id, r.reference_number, r.zone, r.status, r.created_at
FROM public.reports r
WHERE r.assigned_to IS NULL
ORDER BY r.created_at DESC;
