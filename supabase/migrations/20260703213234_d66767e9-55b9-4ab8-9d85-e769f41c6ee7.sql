ALTER TABLE public.shift_requests
  ADD COLUMN IF NOT EXISTS reason_recoverable boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS return_person_id uuid,
  ADD COLUMN IF NOT EXISTS return_person_name text,
  ADD COLUMN IF NOT EXISTS return_person_role text,
  ADD COLUMN IF NOT EXISTS return_date date,
  ADD COLUMN IF NOT EXISTS return_shift_code text;

-- Semilla del catálogo "Motivos de permiso" (recuperable / no recuperable)
INSERT INTO public.catalogos (tipo, valor, extra1, activo)
SELECT v.valor, v.nombre, v.recuperable, true
FROM (VALUES
  ('MOTIVO_PERMISO', 'Cita médica', 'NO_RECUPERABLE'),
  ('MOTIVO_PERMISO', 'Actividad escolar de hijos', 'NO_RECUPERABLE'),
  ('MOTIVO_PERMISO', 'Citación judicial', 'NO_RECUPERABLE'),
  ('MOTIVO_PERMISO', 'Calamidad grave', 'NO_RECUPERABLE'),
  ('MOTIVO_PERMISO', 'Cumpleaños', 'NO_RECUPERABLE'),
  ('MOTIVO_PERMISO', 'Compensatorio', 'NO_RECUPERABLE'),
  ('MOTIVO_PERMISO', 'Estudio', 'RECUPERABLE'),
  ('MOTIVO_PERMISO', 'Licencia', 'RECUPERABLE'),
  ('MOTIVO_PERMISO', 'Diligencia personal', 'RECUPERABLE'),
  ('MOTIVO_PERMISO', 'Otro', 'RECUPERABLE')
) AS v(valor, nombre, recuperable)
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalogos c
  WHERE c.tipo = 'MOTIVO_PERMISO' AND c.valor = v.nombre
);