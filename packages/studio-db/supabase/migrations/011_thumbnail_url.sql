-- BEO-300: project card thumbnails
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
