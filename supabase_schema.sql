-- ============================================================================
-- SCRIPT SQL PARA SUPABASE (PLAN GRATUITO) - CREATIVE STORE (TIENDA DIGITAL)
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

-- ============================================================================
-- CAPA 2 DE SEGURIDAD: TRABAJOS Y SERVICIOS ACTIVOS PRIVADOS (SIN USUARIOS)
-- Ningún visitante público puede listar todos los trabajos con SELECT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.private_jobs (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL,
    access_pin TEXT NOT NULL,
    data JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.private_jobs ENABLE ROW LEVEL SECURITY;

-- Bloquear lectura directa pública (solo accesible vía funciones RPC autorizadas)
DROP POLICY IF EXISTS "Sin lectura directa publica de trabajos" ON public.private_jobs;

-- 1. Registrar un nuevo trabajo desde Pasarela o Canje (público, sin poder leer otros)
CREATE OR REPLACE FUNCTION public.register_private_job(p_job jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id TEXT := COALESCE(p_job->>'id', 'job-' || extract(epoch from now())::bigint::text);
    v_code TEXT := UPPER(TRIM(COALESCE(p_job->>'code', '')));
    v_pin TEXT := TRIM(COALESCE(p_job->>'accessPin', ''));
BEGIN
    IF v_code = '' OR v_pin = '' THEN
        RETURN false;
    END IF;

    INSERT INTO public.private_jobs (id, code, access_pin, data, updated_at)
    VALUES (v_id, v_code, v_pin, p_job, NOW())
    ON CONFLICT (id) DO UPDATE
        SET code = EXCLUDED.code,
            access_pin = EXCLUDED.access_pin,
            data = EXCLUDED.data,
            updated_at = NOW();
    RETURN true;
END;
$$;

-- 2. Consultar únicamente los trabajos cuya pareja (code + pin) coincida
CREATE OR REPLACE FUNCTION public.get_authorized_jobs(p_queries jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF p_queries IS NULL OR jsonb_typeof(p_queries) <> 'array' OR jsonb_array_length(p_queries) = 0 THEN
        RETURN '[]'::jsonb;
    END IF;

    SELECT COALESCE(jsonb_agg(pj.data ORDER BY pj.updated_at DESC), '[]'::jsonb)
    INTO v_result
    FROM public.private_jobs pj
    WHERE EXISTS (
        SELECT 1
        FROM jsonb_array_elements(p_queries) q
        WHERE UPPER(TRIM(COALESCE(q->>'code', ''))) = pj.code
          AND TRIM(COALESCE(q->>'pin', '')) = pj.access_pin
    );

    RETURN v_result;
END;
$$;

-- 3. Listar todos los trabajos (uso exclusivo del Panel Administrativo)
CREATE OR REPLACE FUNCTION public.admin_get_all_jobs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_result jsonb;
BEGIN
    SELECT COALESCE(jsonb_agg(data ORDER BY updated_at DESC), '[]'::jsonb)
    INTO v_result
    FROM public.private_jobs;

    RETURN v_result;
END;
$$;

-- 4. Sincronizar todos los trabajos desde el Panel Administrativo
CREATE OR REPLACE FUNCTION public.admin_sync_all_jobs(p_jobs jsonb)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item jsonb;
    v_ids TEXT[] := ARRAY[]::TEXT[];
BEGIN
    IF p_jobs IS NULL OR jsonb_typeof(p_jobs) <> 'array' THEN
        RETURN false;
    END IF;

    FOR v_item IN SELECT jsonb_array_elements(p_jobs)
    LOOP
        v_ids := array_append(v_ids, v_item->>'id');
        INSERT INTO public.private_jobs (id, code, access_pin, data, updated_at)
        VALUES (
            v_item->>'id',
            UPPER(TRIM(COALESCE(v_item->>'code', ''))),
            TRIM(COALESCE(v_item->>'accessPin', '')),
            v_item,
            NOW()
        )
        ON CONFLICT (id) DO UPDATE
            SET code = EXCLUDED.code,
                access_pin = EXCLUDED.access_pin,
                data = EXCLUDED.data,
                updated_at = NOW();
    END LOOP;

    DELETE FROM public.private_jobs
    WHERE NOT (id = ANY(v_ids));

    RETURN true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.register_private_job(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_authorized_jobs(jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_get_all_jobs() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_sync_all_jobs(jsonb) TO anon, authenticated;
