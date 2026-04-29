-- BEO-710: branch-per-app strategy
-- One Neon project per org (stored on orgs), one branch per app (stored on projects)
ALTER TABLE public.orgs ADD COLUMN IF NOT EXISTS neon_project_id TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS neon_branch_id TEXT;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS neon_project_id TEXT;
NOTIFY pgrst, 'reload schema';
