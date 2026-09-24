# Historial Total — datos del paciente globales, bitácora por nivel y botones corregidos

## Qué cambia para el usuario
1. **Tarjeta del paciente**: edad, entidad, régimen, tipo de documento y teléfono salen de los 4 módulos. Se ven igual en todas las pestañas: en Entrantes, Yohany (1007258461) mostrará 28 años, FIDEICOMISO… PPL y régimen ESPECIAL. El conteo "N caso(s) en esta subventana" y el mensaje "sin casos en esta subventana" siguen contando solo la pestaña activa.
2. **"Generar bitácora unificada"** se abre en un submenú con dos opciones, igual que "Exportar a Excel":
   - "Solo <módulo activo>": genera el mismo PDF de hoy, sin cambios.
   - "Todos los módulos (paciente completo)": genera un PDF nuevo con los casos del paciente en Entrantes, Salientes, Atención Domiciliaria y Referencias Internas. Cada caso va separado.
3. **"Ver todos los casos del paciente"** ahora sí hace algo. Abre en pantalla una ventana con la línea de tiempo, en orden de fecha, de todos los casos del paciente en la pestaña activa, incluidos los cerrados y cancelados. Funciona igual en las 4 pestañas.
4. **"Copiar código de gestión"** ya no copia "NO APLICA" ni "PENDIENTE DE RADICACIÓN". En esos casos muestra el aviso que ya existe: "Este caso no tiene código de gestión".
5. **Nombre del archivo del PDF individual**: si el caso no tiene radicado real, el nombre usa el documento del paciente y, si falta, el identificador del caso. Nunca incluye "NO APLICA".

## Qué no se toca
El formato GU-FR-50 (4 hojas, columnas A:Z), "Exportar caso a Excel", "Exportar bitácora PDF de este caso" (solo su contenido), "Información rápida", "Ver historial completo" y "Ver auditoría". Tampoco la línea de tiempo del caso (solo se usa), el login, Control de Mando, Modo Práctica, Cuadro de Turno ni los permisos.

## Detalles técnicos
- **Fuente única a nivel paciente**: se usa `listarHistorialCasos` con `module: "GENERAL"`, `documento`, `periodMode: "ALL"` y `pageSize: 100`, paginando hasta completar. No se crea ningún endpoint, vista, tabla ni migración nuevos. La query key incluye solo el documento, así que se pide una sola vez por documento y se reutiliza al cambiar de pestaña. Se aplican las reglas de acceso del usuario (RLS), sin cambios de permisos.
- Las unidades que devuelve GENERAL se hidratan en lotes por id con las mismas consultas y builders que ya existen (`buildEntrante/Saliente/PHD/Interna`). Luego:
  - `resumenPaciente(todosLosConstruidos)` alimenta la tarjeta. `PacienteCabecera` recibe el resumen global y `totalCasos` sigue siendo el de la pestaña.
  - Para "Todos los módulos", `pdfConsolidado(todosLosConstruidos, documento, "Subventana=GENERAL")`. Esto reutiliza `generarBitacoraConsolidadaPDF` y la línea de tiempo canónica que ya está cerrada.
  - "Ver todos los casos" filtra por el módulo activo y abre un Dialog con los bloques de cada caso ordenados por `fechaBase`. Cada bloque muestra sus eventos de la línea de tiempo (`bloque.seguimientos`). Es solo lectura.
- **`copiarCodigo`**: se agrega el helper `esCodigoReal(cod)`, que devuelve falso para vacío, "NO APLICA", "PENDIENTE…" o "—". Queda en `remisiones-utils.ts` con pruebas.
- **`bitacora-pdf.ts` L365**: si `referencia` no es un código real, se usa el documento del paciente (de `datosPaciente`) o `caseId`. Se confirmará en el código de dónde toma hoy la referencia ese caso y se reportará.
- **Pruebas**: `esCodigoReal`, el nombre de archivo sin "NO APLICA", el filtro por módulo de "Ver todos" y la unión de los 4 módulos en el resumen del paciente.
- **Validaciones**: typecheck, vitest (base → final), build, ESLint de los archivos modificados y security scan. No hay cambios en la base de datos, así que no hace falta el linter de la base.
- **Roles**: admin, operativa y temporal conservan su acceso actual a Historial. Los usuarios inactivos o sin sesión siguen bloqueados. Todo el acceso pasa por la misma función protegida del servidor.
