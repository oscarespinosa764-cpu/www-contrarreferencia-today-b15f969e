# Plan — Invitación, activación y administración segura de credenciales

Alcance limitado a Usuarios / Editar / Datos básicos de acceso + nueva ruta de activación. Ningún otro módulo se toca. Sin librerías nuevas, sin nuevas tablas, sin migraciones destructivas.

## 1. Revisión previa (ya hecha)

- `cambiarPasswordUsuario` y `generarPasswordTemporalUsuario` en `src/lib/usuarios.functions.ts` **ya funcionan de extremo a extremo**: validan admin, llaman a `supabaseAdmin.auth.admin.updateUserById(..., { password })`, auditan sin guardar el valor. La contraseña temporal se devuelve solo una vez, no se persiste. → **No se reescriben.** Se agregan solo las pruebas E2E y ajustes de UI/estado.
- `crearUsuario` hoy exige `password` de 12 chars y crea el usuario con `createUser + email_confirm:true` → NO envía invitación. Se cambia a flujo de invitación real.
- El modal "Datos básicos de acceso" hoy solo muestra correo + botón temporal. Se reemplaza por el estado real y las 4 acciones.

## 2. Cambios en `src/lib/usuarios.functions.ts` (server, reutilizando `supabaseAdmin`)

Se AGREGAN nuevas server fns (sin quitar las existentes salvo la firma de `crearUsuario`):

- **`invitarUsuario`** — reemplaza el path de "password inicial" de `crearUsuario`. Valida admin, normaliza correo, verifica duplicado, llama `supabaseAdmin.auth.admin.inviteUserByEmail(email, { redirectTo: <SITE_URL>/auth/activar-cuenta, data: { nombre } })`, actualiza `profiles` (nombre, cargo, tel, sede, activo) y `user_roles`. Rollback: si la invitación falla, no crea perfil huérfano. Audita `USER_INVITED`.
- **`reenviarInvitacion(userId)`** — resuelve email por `getUserById`, invita de nuevo (o `generateLink({type:'invite'})`). Rate-limit simple 60 s por userId (in-memory Map en el módulo). Audita `USER_INVITATION_RESENT`.
- **`enviarResetPasswordUsuario(userId)`** — `supabaseAdmin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo: <SITE_URL>/auth/activar-cuenta }})` y deja que Supabase envíe el correo (o `resetPasswordForEmail`). Audita `USER_PASSWORD_RESET_LINK_SENT`. No guarda el link.
- **`obtenerEstadoAccesoUsuario(userId)`** — devuelve `{ email, estadoCuenta, estadoPassword, activationAt, lastAdminChangeAt }` derivado de `auth.admin.getUserById` (`email_confirmed_at`, `banned_until`, `last_sign_in_at`, `invited_at`, `confirmed_at`) + últimas entradas de `audit_logs` para ese `registro_id` con acciones `USER_PASSWORD_*`, `USER_TEMP_PASSWORD_GENERATED`, `USER_ACCOUNT_ACTIVATED`. Solo admin. No devuelve hash ni tokens.
- **`crearUsuario`** — se ajusta: `password` pasa a **opcional**; si viene se conserva el path actual (compatibilidad), pero la UI ya no lo envía. La UI de "Nuevo usuario" quita el campo Contraseña y llama a `invitarUsuario`.

## 3. Ruta de activación `src/routes/auth.activar-cuenta.tsx` (nueva, pública)

- Lee `type=invite|recovery` + tokens del hash con el mismo patrón que `/auth` actual (browser client, `supabase.auth.exchangeCodeForSession` / detección estándar).
- Muestra `USUARIO` (email de la sesión temporal, solo lectura), campos `Nueva contraseña` / `Confirmar` con toggle mostrar/ocultar (sin uppercase), botón `ACTIVAR CUENTA`.
- Valida política (10 chars, mayús/minús/dígito/símbolo, no espacios, no igual al correo, coincidencia).
- Llama `supabase.auth.updateUser({ password })`. Al éxito registra `USER_ACCOUNT_ACTIVATED` vía `registrarAuditoria` y redirige a `/`.
- Errores: enlace inválido/vencido → mensaje "EL ENLACE DE ACTIVACIÓN NO ES VÁLIDO O YA VENCIÓ".

## 4. Cambios de UI en `src/components/coordinacion/usuarios-panel.tsx`

- **Modal "Nuevo usuario"**: quitar el campo Contraseña. Añadir hint "Se enviará una invitación al correo para que el funcionario establezca su contraseña." Botón pasa a llamar `invitarUsuario`.
- **Modal "Editar usuario"**: el campo Correo sigue editable (ya está). Se elimina el bloque "Nueva contraseña / Confirmar / Mostrar / Guardar" del cuerpo del modal — ahora vive solo dentro de "Datos básicos de acceso".
- **Modal "Datos básicos de acceso"** — reemplazo del contenido actual:
  - USUARIO DE ACCESO + copiar
  - ESTADO DE LA CUENTA (badge derivado)
  - ESTADO DE LA CONTRASEÑA
  - FECHA DE ACTIVACIÓN / ÚLTIMO CAMBIO ADMINISTRATIVO
  - Acciones dinámicas según estado:
    - Pendiente: `Copiar usuario`, `Reenviar invitación`
    - Activa: `Copiar usuario`, `Enviar enlace para restablecer`, `Establecer nueva contraseña` (sub-modal existente), `Generar contraseña temporal` (con confirmación previa, ya presente)
    - Inactiva/Bloqueada: `Copiar usuario`, `Activar cuenta` (reutiliza `cambiarEstadoUsuario`)
  - Al mostrar la contraseña temporal: bloque con `USUARIO`, `CONTRASEÑA TEMPORAL`, botones `Copiar usuario`, `Copiar contraseña`, `Copiar datos de acceso`, aviso "SE MOSTRARÁ UNA SOLA VEZ".
  - Limpieza del `tempPass` en `onOpenChange=false`, al cambiar de usuario, y en `useEffect` cleanup.

## 5. Guards para operativos

- El botón "Datos básicos de acceso" ya está dentro del panel de admin. Se confirma que los server fns validan `has_role admin` (todos lo hacen). No se toca ninguna otra ruta.

## 6. Auditoría

Todas las server fns nuevas insertan una fila en `audit_logs` con acción específica, `registro_id = userId`, `actor_email` derivado, sin token/hash/password.

## 7. Pruebas E2E (Playwright headless, `/tmp/browser/`)

Se ejecutan tras compilar:
1. Login como admin de prueba (usando `LOVABLE_BROWSER_*`).
2. Crear usuario QA → confirmar toast "Invitación enviada".
3. Modal Datos básicos → verificar estado "INVITACIÓN PENDIENTE".
4. Generar contraseña temporal → copiar valor visible una vez.
5. Nueva pestaña incógnita → login con esa contraseña → éxito.
6. Reabrir modal → verificar que `tempPass` ya no está.
7. Revisar `audit_logs` (via `supabase--read_query`) para confirmar eventos sin password.

## 8. Detalle técnico

- Envío de correos: se usa el sistema de auth de Supabase (invite/recovery) — **no** se configura infra de email adicional a menos que ya esté activa; si no lo está, el usuario verá el link en el dashboard de Supabase, y esto se documenta en el entregable (fuera del alcance de este prompt configurar dominio de correo).
- `SITE_URL` para redirect: se lee desde `process.env.PUBLIC_SITE_URL` con fallback a `https://www.contrarreferencia.today`.
- Cliente admin: se reutiliza `@/integrations/supabase/client.server` — no se crea otro.
- Middleware: `requireSupabaseAuth` en todas las nuevas fns.

## 9. Fuera de alcance (no se implementa)

- Rediseño de Control de Mando, menús, colores, otros módulos.
- Nuevas tablas o columnas: se derivan estados de `auth.users` + `audit_logs` existentes.
- Configuración de dominio de correo transaccional.
- Cambio de RLS de tablas no relacionadas.
