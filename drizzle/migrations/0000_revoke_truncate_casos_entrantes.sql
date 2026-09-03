-- B.1.2D: TRUNCATE ignora RLS. `authenticated` conservaba este privilegio
-- heredado sobre casos_entrantes, lo que permitía vaciar la tabla sin pasar
-- por las funciones server autorizadas. Se retira junto a REFERENCES/TRIGGER,
-- que tampoco necesita el cliente. SELECT y DELETE (política admin) intactos.
REVOKE TRUNCATE, REFERENCES, TRIGGER ON public.casos_entrantes FROM authenticated;
