-- Restringir la lectura de la columna sensible identification_number.
-- El rol `authenticated` conserva todos los privilegios (INSERT/UPDATE/DELETE)
-- y la lectura de TODAS las columnas EXCEPTO identification_number.
-- La RLS existente (is_active_member para SELECT, admin para escritura) se mantiene.
-- `service_role` conserva ALL para operaciones de servidor/administración.

REVOKE SELECT ON public.shift_schedule_members FROM authenticated;

GRANT SELECT (
  id,
  schedule_id,
  user_id,
  full_name,
  role_name,
  sede,
  active,
  base_hours,
  pending_hours,
  notes,
  sort_order,
  unidad_funcional,
  created_at,
  updated_at
) ON public.shift_schedule_members TO authenticated;
