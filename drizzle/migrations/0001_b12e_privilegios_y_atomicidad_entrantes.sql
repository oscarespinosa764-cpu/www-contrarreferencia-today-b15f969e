-- ===========================================================
-- B.1.2E · 1) Saneamiento global de privilegios destructivos/DDL
-- para roles cliente (authenticated / anon / PUBLIC).
-- TRUNCATE, REFERENCES, TRIGGER y MAINTAIN no son necesarios para
-- ningún flujo de la aplicación y NO están gobernados por RLS.
-- ===========================================================
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON ALL TABLES IN SCHEMA public FROM PUBLIC;

-- 2) DELETE directo de Entrantes: el borrado legítimo (zona de borrado
-- seguro, admin-only) se ejecuta server-side con service_role.
REVOKE DELETE ON public.casos_entrantes FROM authenticated;
REVOKE DELETE ON public.casos_entrantes FROM anon;
REVOKE DELETE ON public.casos_entrantes FROM PUBLIC;

-- 3) Default privileges: las tablas nuevas no deben heredar de nuevo
-- TRUNCATE/REFERENCES/TRIGGER/MAINTAIN para roles cliente.
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['postgres','supabase_admin'] LOOP
    BEGIN
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM authenticated', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM anon', r);
      EXECUTE format(
        'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLES FROM PUBLIC', r);
    EXCEPTION WHEN insufficient_privilege THEN
      RAISE WARNING 'No se pudo ajustar default privileges del rol %', r;
    END;
  END LOOP;
END $$;

-- ===========================================================
-- 4) Atomicidad real de las operaciones compuestas de Entrantes.
-- Una única transacción: INSERT del evento + UPDATE del caso padre.
-- Sin SQL dinámico: la fila se tipa contra public.casos_entrantes.
-- ===========================================================
CREATE OR REPLACE FUNCTION private.entrante_evento_compuesto(
  _actor uuid,
  _caso_id uuid,
  _tipo text,
  _fila jsonb,
  _estado_padre text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_padre public.casos_entrantes%ROWTYPE;
  v_row   public.casos_entrantes%ROWTYPE;
BEGIN
  IF _actor IS NULL OR NOT private.is_active_member(_actor) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario no autorizado');
  END IF;
  IF _tipo NOT IN ('ING','CAN','AMP') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo de evento no permitido');
  END IF;

  -- Control de concurrencia: el padre queda bloqueado durante toda la
  -- transacción, de modo que dos confirmaciones/cancelaciones simultáneas
  -- se serializan y la segunda ve el estado ya escrito.
  SELECT * INTO v_padre FROM public.casos_entrantes WHERE id = _caso_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'El caso no existe');
  END IF;

  v_row := jsonb_populate_record(NULL::public.casos_entrantes, _fila);
  v_row.id         := gen_random_uuid();
  v_row.tipo       := _tipo;
  v_row.cod_ref    := v_padre.codigo;
  v_row.created_by := _actor;
  v_row.created_at := now();
  v_row.updated_at := now();
  v_row.archivado  := COALESCE(v_row.archivado, false);

  BEGIN
    INSERT INTO public.casos_entrantes VALUES (v_row.*);
  EXCEPTION WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'DUPLICADO');
  END;

  IF _estado_padre IS NOT NULL THEN
    UPDATE public.casos_entrantes
       SET estado = _estado_padre, updated_at = now()
     WHERE id = v_padre.id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'codigo', v_row.codigo,
                            'estado_padre', COALESCE(_estado_padre, v_padre.estado));
END;
$$;

REVOKE ALL ON FUNCTION private.entrante_evento_compuesto(uuid, uuid, text, jsonb, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.entrante_evento_compuesto(
  _actor uuid,
  _caso_id uuid,
  _tipo text,
  _fila jsonb,
  _estado_padre text DEFAULT NULL
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path TO ''
AS $$
  SELECT private.entrante_evento_compuesto(_actor, _caso_id, _tipo, _fila, _estado_padre);
$$;

REVOKE ALL ON FUNCTION public.entrante_evento_compuesto(uuid, uuid, text, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.entrante_evento_compuesto(uuid, uuid, text, jsonb, text) FROM anon;
REVOKE ALL ON FUNCTION public.entrante_evento_compuesto(uuid, uuid, text, jsonb, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.entrante_evento_compuesto(uuid, uuid, text, jsonb, text) TO service_role;