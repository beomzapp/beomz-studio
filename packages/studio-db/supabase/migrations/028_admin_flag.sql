-- BEO-634: Add is_admin flag to users table
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
UPDATE public.users SET is_admin = true WHERE id = 'b4bee0d4-2128-44f7-8edd-0c796fe4242c';
NOTIFY pgrst, 'reload schema';
