
UPDATE public.reglas_coordinacion
SET notificar_externo = true,
    canales = ARRAY['telegram']::text[],
    updated_at = now()
WHERE archivado = false
  AND activo = true
  AND prioridad IN ('ALTO','CRITICO')
  AND notificar_externo = false;
