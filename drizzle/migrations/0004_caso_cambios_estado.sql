CREATE TABLE public.caso_cambios_estado (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  caso_id uuid NOT NULL,
  modulo text NOT NULL CHECK (modulo IN ('ENTRANTES','SALIENTES','ATENCION_DOMICILIARIA','REFERENCIAS_INTERNAS')),
  estado_anterior text,
  estado_nuevo text,
  actor_id uuid,
  actor_nombre text NOT NULL DEFAULT 'SISTEMA',
  origen text NOT NULL DEFAULT 'USUARIO',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX caso_cambios_estado_caso_idx ON public.caso_cambios_estado (caso_id, created_at);
REVOKE ALL ON public.caso_cambios_estado FROM anon, authenticated;
GRANT SELECT ON public.caso_cambios_estado TO authenticated;
GRANT ALL ON public.caso_cambios_estado TO service_role;
ALTER TABLE public.caso_cambios_estado ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Miembros activos leen cambios de estado" ON public.caso_cambios_estado
  FOR SELECT TO authenticated USING (public.is_active_member(auth.uid()));

CREATE OR REPLACE FUNCTION public.caso_cambios_estado_inmutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'caso_cambios_estado es de solo inserción';
END $$;
CREATE TRIGGER caso_cambios_estado_no_update BEFORE UPDATE OR DELETE ON public.caso_cambios_estado
  FOR EACH ROW EXECUTE FUNCTION public.caso_cambios_estado_inmutable();

CREATE OR REPLACE FUNCTION public.registrar_cambio_estado_caso()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  _uid uuid := auth.uid();
  _nombre text;
  _col text := TG_ARGV[1];
  _ant text;
  _nue text;
BEGIN
  _ant := to_jsonb(OLD) ->> _col;
  _nue := to_jsonb(NEW) ->> _col;
  IF _ant IS NOT DISTINCT FROM _nue THEN RETURN NEW; END IF;
  IF _uid IS NOT NULL THEN
    SELECT p.nombre INTO _nombre FROM public.profiles p WHERE p.user_id = _uid LIMIT 1;
  END IF;
  INSERT INTO public.caso_cambios_estado (caso_id, modulo, estado_anterior, estado_nuevo, actor_id, actor_nombre, origen)
  VALUES (NEW.id, TG_ARGV[0], _ant, _nue, _uid,
    COALESCE(NULLIF(_nombre,''), CASE WHEN _uid IS NULL THEN 'SISTEMA' ELSE 'USUARIO SIN NOMBRE' END),
    CASE WHEN _uid IS NULL THEN 'SISTEMA:' || TG_TABLE_NAME || '.' || _col ELSE 'USUARIO' END);
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.registrar_cambio_estado_caso() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.caso_cambios_estado_inmutable() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER zzz_cambio_estado_remisiones AFTER UPDATE OF estado ON public.remisiones
  FOR EACH ROW EXECUTE FUNCTION public.registrar_cambio_estado_caso('SALIENTES','estado');
CREATE TRIGGER zzz_cambio_estado_ri AFTER UPDATE OF estado ON public.referencia_interna
  FOR EACH ROW EXECUTE FUNCTION public.registrar_cambio_estado_caso('REFERENCIAS_INTERNAS','estado');
CREATE TRIGGER zzz_cambio_estado_domi AFTER UPDATE OF estado_ciclo ON public.domiciliarios
  FOR EACH ROW EXECUTE FUNCTION public.registrar_cambio_estado_caso('ATENCION_DOMICILIARIA','estado_ciclo');