## Objetivo

Implementar control de acceso por navegador autorizado usando solo la infraestructura actual (Lovable Cloud, Auth, RLS, server functions, Web Crypto + IndexedDB). Dejar el sistema en modo **BOOTSTRAP**, autorizar el navegador del administrador principal, verificar todo, y **detenerse antes de activar ENFORCED** (activación manual desde Control de Mando).

## Alcance

Aplica a todas las rutas bajo `/_authenticated/*`. Se excluyen: `/login`, `/activar-cuenta`, `/firma-entrega`, `/privacidad`, y endpoints públicos QR/webhooks bajo `/api/public/*` y `/lovable/*`.

NO se modifican módulos clínicos, plantillas, catálogos, firma QR, cuadro de turno, ni Auth existente.

## Arquitectura

### Credencial del navegador (Web Crypto + IndexedDB)
- Par ECDSA P-256 generado en el navegador, `privateKey` **no exportable** guardada en IndexedDB.
- Clave pública (JWK) enviada al servidor y almacenada en `authorized_devices.public_key`.
- Login: servidor emite challenge → navegador firma → server function verifica firma con la clave pública y vincula `session_id` a `authorized_device_sessions`.

### Base de datos (nuevas tablas, todas con RLS + GRANTs)
- `authorized_devices` — un dispositivo por (user_id, device_public_id), estados PENDIENTE/AUTORIZADO/RECHAZADO/REVOCADO/BLOQUEADO/EXPIRADO.
- `device_access_requests` — solicitudes de aprobación con idempotencia (índice único parcial sobre (user_id, device_id) WHERE estado='PENDIENTE').
- `authorized_device_sessions` — vínculo sesión Auth ↔ dispositivo, estados ACTIVA/REVOCADA/EXPIRADA/CERRADA.
- `device_challenges` — retos criptográficos de un solo uso, TTL corto.
- `device_recovery_codes` — códigos de recuperación (solo hash, un solo uso, vigencia corta).
- `system_settings` (o reutilizar si existe) — clave `device_access_mode` con valor DISABLED/BOOTSTRAP/ENFORCED/EMERGENCY_RECOVERY, leído solo en servidor.

### Funciones SQL (SECURITY DEFINER, search_path='')
- `public.is_current_session_device_authorized()` — devuelve boolean, verifica usuario activo, sesión, dispositivo AUTORIZADO no revocado/expirado, vínculo con `auth.jwt() ->> 'session_id'`, modo global. **En modo BOOTSTRAP** devuelve `true` para el admin bootstrap identificado, sin exigir dispositivo. **En modo DISABLED** devuelve siempre `true`. En **ENFORCED** exige todo.
- `public.get_device_access_mode()` — lectura del modo, stable.
- Función helper para consumir challenge + registrar sesión (usada solo por server functions autorizadas).

### RLS
- **NO** se reemplazan políticas existentes. Se **añade** `AND public.is_current_session_device_authorized()` a las políticas de tablas sensibles ya listadas.
- Fase 1 (esta entrega): agregar la verificación a tablas más críticas: `profiles`, `user_roles`, `casos_entrantes`, `remisiones`, `referencia_interna`, `domiciliarios`, `seguimientos`, `historicos_casos`, `plantillas`, `plantillas_versiones`, `catalogos`, `checklists`, `audit_logs`, `alertas_coordinacion`, `avisos`, `shift_requests`, `entrega_firmas` (mantener excepción a firma QR pública server-side vía service role).
- Como la función devuelve `true` en modo BOOTSTRAP/DISABLED, no rompe el sistema actual.

### Server functions (nuevas, en `src/lib/devices.functions.ts`)
- `requestDeviceChallenge` — emite challenge (protegido por `requireSupabaseAuth`).
- `registerDeviceAndRequest` — recibe public_key + firma del challenge, crea `authorized_devices` PENDIENTE + `device_access_requests`.
- `verifyDeviceAndLinkSession` — verifica firma, vincula `session_id` actual en `authorized_device_sessions`.
- `getMyDeviceStatus` — estado limitado de solicitud/dispositivo del propio usuario (para pantalla pendiente).
- `bootstrapAuthorizeCurrentDevice` — solo en modo BOOTSTRAP y solo para admin bootstrap: registra + autoriza + vincula el dispositivo actual.
- Admin: `listDevices`, `listDeviceRequests`, `adminApproveDevice`, `adminRejectDevice`, `adminRevokeDevice`, `adminBlockDevice`, `adminUnblockDevice`, `adminRenameDevice`, `adminSetExpiration`, `adminCloseSession`, `adminCloseAllDeviceSessions`, `adminSetGlobalMode` (ENFORCED requiere reautenticación + frase). Todas exigen admin autorizado, no autoaprobar, escriben auditoría vía `registrarAuditoriaServer`.
- `generateRecoveryCode`, `consumeRecoveryCode` (un solo uso).

### Frontend
- `src/lib/device-credential.ts` — helper Web Crypto/IndexedDB (generar par, firmar challenge, leer public JWK).
- `src/lib/device-guard.tsx` — `DeviceGate` que envuelve el layout `_authenticated`. Estados: `VALIDANDO` → (autorizado → children) / (pendiente → `PantallaPendiente`) / (rechazado/revocado/bloqueado/expirado → pantalla informativa) / (error).
- Se monta en `src/routes/_authenticated.tsx` **envolviendo el `Outlet`**, tras la resolución de Auth. No se toca la lógica de la ruta ni `AuthProvider`.
- Panel Control de Mando: nueva pestaña **"Dispositivos"** en `src/routes/_authenticated/control-mando.tsx`, componente `src/components/coordinacion/dispositivos-panel.tsx` con tarjetas KPI, tablas por estado, acciones administrativas, botón "Autorizar este dispositivo administrador" (solo BOOTSTRAP), botón "Activar restricción de dispositivos" (deshabilitado hasta cumplir requisitos, con confirmación de frase).
- Perfil: sección "Mis dispositivos" (vista simple del usuario, cerrar sesiones, solicitar revocación) — añadido a `usuarios-panel` o nueva subventana.

### Modo BOOTSTRAP
- Migración deja `device_access_mode='BOOTSTRAP'`.
- Admin bootstrap: identificado por rol admin + email `coordreferencia@cedimips.com` (patrón existente en `handle_new_user`). Configurable en `system_settings.bootstrap_admin_user_id` una vez autorizado.
- **NO se activa ENFORCED en la misma migración.** Botón manual + confirmación + reautenticación.

## Pasos de entrega

1. Migración: tablas + índices + funciones SQL + `device_access_mode='BOOTSTRAP'` + GRANTs + RLS de las tablas nuevas.
2. Migración fase 2 (misma migración, seguro porque la función devuelve `true` en BOOTSTRAP): añadir `AND is_current_session_device_authorized()` a políticas de tablas sensibles listadas.
3. Server functions en `src/lib/devices.functions.ts` + `src/lib/devices.server.ts` (verificación de firma ECDSA con WebCrypto en Worker).
4. Cliente: `device-credential.ts`, `device-guard.tsx`, integración en `_authenticated.tsx`.
5. UI Control de Mando: `dispositivos-panel.tsx` + pestaña, botón autorizar bootstrap, botón activar ENFORCED (deshabilitado por defecto, verificaciones previas).
6. UI perfil: "Mis dispositivos".
7. Auditoría: agregar acciones DEVICE_* al allowlist en `src/lib/auditoria-allowlist.ts`.

## Fuera de alcance / no se toca

- Auth, login, activar-cuenta, firma QR, correos, dominios, GitHub, módulos clínicos, plantillas, catálogos, cuadro de turno, reportes.
- No se activa ENFORCED. Queda como acción manual del administrador tras verificar bootstrap + reingreso + segundo dispositivo + recuperación.

## Notas técnicas

- Verificación ECDSA en el Worker: `crypto.subtle.verify` está disponible (Web Crypto en runtime Cloudflare) — sin dependencias nativas.
- Challenge: 32 bytes aleatorios, TTL 2 min, hash SHA-256 almacenado, `used_at` marcado al consumir.
- `session_id`: leído del claim `session_id` del JWT (`context.claims.session_id`).
- Polling pantalla pendiente: cada 15 s vía `getMyDeviceStatus` (limitado al propio user_id, sin exponer otros datos).
- Storage privado: los buckets existentes (`firmas`, `permiso-soportes`) ya son privados; se documenta que futuras rutas server-side privadas deben llamar `is_current_session_device_authorized()`.

## Confirmación antes de continuar

Este plan crea 5 tablas nuevas, ~15 server functions, 1 pantalla nueva y modifica RLS en ~17 tablas (añadiendo un AND, sin romper nada porque en BOOTSTRAP la función devuelve `true`). Es una entrega grande. ¿Apruebas que proceda con la implementación en un solo lote, dejando el sistema en BOOTSTRAP y con el botón de ENFORCED visible pero deshabilitado hasta cumplir las pruebas descritas?