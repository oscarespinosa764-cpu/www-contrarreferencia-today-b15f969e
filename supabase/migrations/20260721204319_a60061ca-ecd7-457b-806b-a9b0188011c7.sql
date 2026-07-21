UPDATE public.reglas_coordinacion
SET notificar_externo = true,
    canales = ARRAY['telegram']::text[],
    updated_at = now()
WHERE codigo = 'ALT-ENT-INGRESO-SIN-REFERENCIA';