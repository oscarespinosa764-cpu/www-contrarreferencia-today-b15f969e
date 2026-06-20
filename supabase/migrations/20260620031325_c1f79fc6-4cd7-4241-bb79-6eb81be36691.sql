-- Defensa en profundidad: revocar TODO acceso del rol anon a las tablas de datos.
-- RLS ya bloqueaba a anon (ninguna política lo incluye), pero quitamos también el GRANT.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Evitar que futuras tablas/secuencias otorguen acceso a anon por defecto.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;