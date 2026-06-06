# Plan — Ajustes Bitácora de Remisiones + Sesión

## 1. Tarjeta del caso (imagen 1) — `caso-remision-card.tsx`

**Tiempo transcurrido (esquina inferior derecha):**
- Quitar el chip de tiempo del encabezado (arriba a la derecha, junto a "Rad").
- Colocarlo abajo a la derecha de la tarjeta (donde está la X roja).
- Eliminar los segundos → mostrar solo `días, horas, minutos`.
- Color del recuadro según antigüedad:
  - menos de 12 h → verde
  - 12 h a menos de 120 h → amarillo
  - 120 h o más → rojo

**Última gestión (junto al botón Seguimiento):**
- Quitarla de su posición actual (debajo del motivo) y ubicarla en la fila de acciones, al lado del botón "Seguimiento".
- Si hay gestión previa: mostrar **fecha, hora y quién** la realizó.
- Si no hay: "Sin seguimientos registrados".
- (La data ya llega vía `ultimaGestion = { fecha, responsable }`; se aprovecha tal cual.)

**Texto "Motivo":**
- Cambiar la etiqueta `Motivo:` por `Justificación remisión:`.

**Marquita de prioridad (media/baja/alta):**
- baja → verde, media → amarillo, alta → rojo (hoy solo se colorea "alta" en rojo).

**Borde izquierdo de la tarjeta:**
- Cambiar el color fijo azul/teal por el color de prioridad (verde / amarillo / rojo).

**Rad:** se mantiene el color actual.

## 2. Modal de seguimiento (imagen 2) — `seguimiento-dialog.tsx`

- **"Agregar nuevo radicado"**: convertirlo en un **botón** con estilo (outline/secundario), no texto plano.
- **"No aplica (esta EPS no genera radicado)"**: mostrar la casilla **solo cuando el número de radicado está vacío** (no generado). Si ya hay radicado guardado, ocultarla.
- **Tipo de seguimiento**: agregar la opción **"Radicado de trámite de remisión"** (para cuando solo se registra el radicado).
- **Evolución diaria — especialidades correctas**: hoy usa las especialidades **destino/receptoras**. Debe usar las **especialidades tratantes (remisoras)**. Se pasará `r.especialidades_tratantes` en lugar de `r.especialidades_receptoras` al modal.

## 3. Evolución diaria con guardado independiente (imagen 4) — `seguimiento-dialog.tsx`

- Mantener las dos casillas por especialidad **Índigo / EAPB** (con visual de check, ya lo es).
- Agregar un botón **"Guardar"** propio dentro del recuadro de "Evolución diaria" (en la fila del título), que muestre "Guardando…" mientras procesa.
- Ese botón guarda **solo la evolución** (actualiza `evolucion` y `evolucion_detalle` del caso) **sin exigir** tipo de seguimiento ni el resto del modal.
- El botón inferior "Registrar seguimiento" sigue funcionando como hasta ahora (sí exige tipo de seguimiento).

## 4. Color coding centralizado — `remisiones-utils.ts`

- `fmtTranscurrido`: quitar segundos (solo días/horas/min).
- Nuevo helper `tiempoTono(fromISO)` → devuelve `verde | amarillo | rojo` según los umbrales (12 h / 120 h).
- Nuevo helper `prioridadMeta(prioridad)` → mapea baja/media/alta a clases de color (borde, texto, fondo) usando los tokens `status-green / status-amber / status-red` ya existentes en `styles.css`.

## 5. Sesión por inactividad (imagen 3)

**Nuevo componente** `src/components/session-timeout.tsx` + hook de inactividad, montado dentro del layout `_authenticated.tsx`:
- Detecta inactividad (mouse, teclado, scroll, touch). Tras **3 horas sin actividad**, muestra el modal "Sesión expirada" con dos acciones:
  - **Cerrar sesión** → `signOut()`.
  - **Continuar/Renovar** → refresca la sesión (`supabase.auth.refreshSession()`), reinicia el contador y cierra el modal.
- Si tras aparecer el modal pasa **1 hora más** sin que el usuario presione "Continuar", se ejecuta `signOut()` automáticamente.

**Cierre al cerrar pestaña/navegador:**
- Marcar la sesión como "viva" en `sessionStorage` al cargar la app autenticada. Como `sessionStorage` se borra al cerrar la pestaña/navegador, al volver a abrir sin esa marca se fuerza `signOut()`. Esto cierra la sesión cuando se cierra la pestaña o el navegador, sin afectar la navegación dentro de la misma pestaña.
- (Nota técnica: `client.ts` es autogenerado y persiste en `localStorage`; por eso el cierre por cierre de pestaña se implementa con la marca de `sessionStorage`, sin tocar ese archivo.)

## Detalles técnicos

- Tokens de color (verde/amarillo/rojo) ya existen: `status-green`, `status-amber`, `status-red` en `src/styles.css`. No se crean colores nuevos.
- Cambios contenidos a: `caso-remision-card.tsx`, `seguimiento-dialog.tsx`, `remisiones-utils.ts`, `_authenticated.tsx`, y un nuevo `session-timeout.tsx`. Sin cambios de base de datos.
- `GenericoCard` (PHD/internas/pendientes) en `remisiones.tsx` también usa tiempo/última gestión; se aplicará el mismo color de tiempo para consistencia, opcional según prioridad.

## Pendiente / fuera de alcance
- Trazabilidad completa de seguimientos (el usuario indicó que se organizará en otro lugar más adelante).
- Formatos de exportación (PDF/Excel) — el usuario los enviará al final.
