-- control_mando es una bitácora inmutable (append-only).
-- No existen políticas UPDATE/DELETE (fail-closed). Se retiran los grants
-- accidentales de edición/eliminación para authenticated como defensa en profundidad.
-- Reversible: volver a otorgar UPDATE, DELETE a authenticated.
REVOKE UPDATE, DELETE, TRUNCATE ON public.control_mando FROM authenticated;