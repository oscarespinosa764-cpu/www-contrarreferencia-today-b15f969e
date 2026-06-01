-- ============ ENUM DE ROLES ============
CREATE TYPE public.app_role AS ENUM ('admin', 'operativa', 'temporal');

-- ============ FUNCION TIMESTAMPS ============
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ============ PERFILES ============
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  nombre TEXT,
  cargo TEXT,
  tipo_documento TEXT,
  numero_documento TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ============ ROLES DE USUARIO ============
CREATE TABLE public.user_roles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- ============ FUNCION has_role (SECURITY DEFINER) ============
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Conveniencia: ¿puede editar? (admin u operativa)
CREATE OR REPLACE FUNCTION public.can_edit(_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','operativa')
  )
$$;

-- ============ TRIGGER NUEVO USUARIO ============
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, nombre)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nombre', NEW.email));

  -- Rol por defecto: operativa (el administrador puede ajustarlo luego)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'operativa');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ POLITICAS PERFILES ============
CREATE POLICY "Perfiles: ver propio o admin ve todos"
ON public.profiles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Perfiles: insertar el propio"
ON public.profiles FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Perfiles: editar propio o admin"
ON public.profiles FOR UPDATE TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

-- ============ POLITICAS ROLES ============
CREATE POLICY "Roles: ver propios o admin ve todos"
ON public.user_roles FOR SELECT TO authenticated
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Roles: admin gestiona"
ON public.user_roles FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ============ REMISIONES SALIENTES ============
CREATE TABLE public.remisiones (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  asegurador TEXT,
  evolucion TEXT,
  fecha_inicio DATE,
  fecha_radicado DATE,
  cama TEXT,
  servicio TEXT,
  paciente TEXT,
  documento TEXT,
  edad TEXT,
  cie10 TEXT,
  especialidades_tratantes TEXT,
  especialidades_receptoras TEXT,
  prioridad TEXT,
  remision_por TEXT,
  especificacion TEXT,
  tipo_tramite TEXT,
  regimen TEXT,
  codigo_radicacion TEXT,
  estado TEXT,
  ips_receptora TEXT,
  tipo_ambulancia TEXT,
  soportes TEXT,
  prestador_traslado TEXT,
  contacto_nombre TEXT,
  contacto_parentesco TEXT,
  contacto_telefono TEXT,
  pqrs TEXT,
  observaciones TEXT,
  evolucion_detalle TEXT,
  texto_ia TEXT,
  archivado BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.remisiones TO authenticated;
GRANT ALL ON public.remisiones TO service_role;

ALTER TABLE public.remisiones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Remisiones: autenticados ven"
ON public.remisiones FOR SELECT TO authenticated USING (true);

CREATE POLICY "Remisiones: editores crean"
ON public.remisiones FOR INSERT TO authenticated
WITH CHECK (public.can_edit(auth.uid()));

CREATE POLICY "Remisiones: editores actualizan"
ON public.remisiones FOR UPDATE TO authenticated
USING (public.can_edit(auth.uid()));

CREATE POLICY "Remisiones: admin elimina"
ON public.remisiones FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_remisiones_updated_at
BEFORE UPDATE ON public.remisiones
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ CASOS ENTRANTES (R&C) ============
CREATE TABLE public.casos_entrantes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  codigo TEXT,
  tipo TEXT,
  documento TEXT,
  ips TEXT,
  medico TEXT,
  especialidad TEXT,
  unidad TEXT,
  aseguramiento TEXT,
  detalle TEXT,
  estado TEXT,
  fecha DATE,
  fecha_vence TIMESTAMPTZ,
  hrs_reserva TEXT,
  cod_ref TEXT,
  nombres TEXT,
  apellidos TEXT,
  eapb TEXT,
  regimen TEXT,
  texto_ia TEXT,
  archivado BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.casos_entrantes TO authenticated;
GRANT ALL ON public.casos_entrantes TO service_role;

ALTER TABLE public.casos_entrantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Casos: autenticados ven"
ON public.casos_entrantes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Casos: editores crean"
ON public.casos_entrantes FOR INSERT TO authenticated
WITH CHECK (public.can_edit(auth.uid()));

CREATE POLICY "Casos: editores actualizan"
ON public.casos_entrantes FOR UPDATE TO authenticated
USING (public.can_edit(auth.uid()));

CREATE POLICY "Casos: admin elimina"
ON public.casos_entrantes FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_casos_entrantes_updated_at
BEFORE UPDATE ON public.casos_entrantes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ SEGUIMIENTOS ============
CREATE TABLE public.seguimientos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  caso_id UUID NOT NULL,
  tipo_caso TEXT NOT NULL,
  radicado TEXT,
  tipo_seguimiento TEXT,
  detalle TEXT,
  nombre_usuario TEXT,
  archivado BOOLEAN NOT NULL DEFAULT false,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.seguimientos TO authenticated;
GRANT ALL ON public.seguimientos TO service_role;

ALTER TABLE public.seguimientos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Seguimientos: autenticados ven"
ON public.seguimientos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Seguimientos: editores crean"
ON public.seguimientos FOR INSERT TO authenticated
WITH CHECK (public.can_edit(auth.uid()));

CREATE POLICY "Seguimientos: editores actualizan"
ON public.seguimientos FOR UPDATE TO authenticated
USING (public.can_edit(auth.uid()));

CREATE POLICY "Seguimientos: admin elimina"
ON public.seguimientos FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_seguimientos_caso ON public.seguimientos (caso_id, tipo_caso);

-- ============ CATALOGOS ============
CREATE TABLE public.catalogos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo TEXT NOT NULL,
  valor TEXT NOT NULL,
  extra1 TEXT,
  extra2 TEXT,
  activo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.catalogos TO authenticated;
GRANT ALL ON public.catalogos TO service_role;

ALTER TABLE public.catalogos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Catalogos: autenticados ven"
ON public.catalogos FOR SELECT TO authenticated USING (true);

CREATE POLICY "Catalogos: admin gestiona"
ON public.catalogos FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_catalogos_tipo ON public.catalogos (tipo, activo);