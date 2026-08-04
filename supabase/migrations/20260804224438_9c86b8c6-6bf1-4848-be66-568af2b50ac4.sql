REVOKE ALL ON public.v_hist_unidades FROM authenticated;
REVOKE ALL ON public.v_hist_entrantes_eventos FROM authenticated;
GRANT SELECT ON public.v_hist_unidades TO authenticated;
GRANT SELECT ON public.v_hist_entrantes_eventos TO authenticated;
REVOKE ALL ON public.v_hist_unidades FROM anon;
REVOKE ALL ON public.v_hist_entrantes_eventos FROM anon;
REVOKE EXECUTE ON FUNCTION public.historial_listado(text, timestamptz, timestamptz, text, text, text, text, text, text, text, integer, integer) FROM PUBLIC, anon;