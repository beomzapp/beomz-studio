CREATE TABLE IF NOT EXISTS public.feature_flags (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.feature_flags (key, value) VALUES
  ('modules', '{"web_apps":"live","websites":"live","mobile_apps":"coming_soon","images":"coming_soon","videos":"coming_soon","agents":"live"}')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
