DELETE FROM public.red_operativa WHERE entidad IN ('TEST DEBUG IPS','ent','emp') AND created_by='ebe05b34-d0df-4d7a-be56-c09be3eb8d5f';
NOTIFY pgrst, 'reload schema';