-- ============================================================================
-- SCRIPT SQL PARA SUPABASE (PLAN GRATUITO) - ASTRO STORE (TIENDA DIGITAL)
-- Copia y pega este script en el "SQL Editor" de tu proyecto en Supabase
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.store_collections (
    key TEXT PRIMARY KEY,
    data JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar Row Level Security (RLS)
ALTER TABLE public.store_collections ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura y escritura para la tienda web y su panel administrativo
DROP POLICY IF EXISTS "Lectura publica de tienda" ON public.store_collections;
CREATE POLICY "Lectura publica de tienda" ON public.store_collections
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Escritura desde tienda y admin" ON public.store_collections;
CREATE POLICY "Escritura desde tienda y admin" ON public.store_collections
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Actualizacion desde tienda y admin" ON public.store_collections;
CREATE POLICY "Actualizacion desde tienda y admin" ON public.store_collections
    FOR UPDATE USING (true);
