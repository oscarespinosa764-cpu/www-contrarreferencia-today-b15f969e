# GU-FR-50: arreglar la exportación, ajustar la captura y la plantilla (4 módulos)

## 1. Dónde está hoy cada dato (verificado en la base y en el código)

| Dato | Dónde está | Notas |
|---|---|---|
| Aceptación vigente de Salientes (IPS, sede, fecha) | Gestión `ACEPTACIÓN DE IPS RECEPTORA` (133 filas; en sus detalles: `ips_receptora`, `sede`, `nombre_acepta`, `cargo_acepta`) + el resolver de la aceptación vigente que ya existe | La exportación hoy pone S = B (`fecha_radicado`) y deja O vacía |
| Ciudad (P) | `sede` de la aceptación, por la misma relación IPS → sede que usa Entrantes | Hoy se deja en blanco a propósito |
| Servicio receptor (R) | No se captura | Se agrega (A1) |
| Ambulancia coordinada de Salientes | Gestión `AMBULANCIA COORDINADA` (123 filas; en detalles: `fecha`, `hora`, `empresa`, `variante`) | La fecha y hora coordinada ya existe, pero la exportación la deja vacía |
| Fecha de solicitud de ambulancia (U) | No se captura | Se agrega (A2) |
| Estados de Salientes | 8 valores reales, todos incluidos en la tabla 3.2 | No se encontró ningún estado fuera de la tabla |
| `tipo_tramite` | REMISIÓN POR TRÁMITE ADMINISTRATIVO CANCELABLE 312 · REMISIÓN ASISTENCIAL 116 · REMISIÓN ASISTENCIAL POR SOAT 13 · PERTINENCIA MEDICA 5 · TRAMITE ADMINISTRATIVO 2 | Se compara contra la regla de K en el informe; no reemplaza la regla |
| Prioridad clínica | Salientes: ALTA 60 / MEDIA 93 / BAJA 295 · AD: ALTA 1 (el resto vacío) · RI: MEDIA 2, BAJA 1 | Ningún caso tiene guardado ALTO, MEDIO o BAJO |
| "Requiere ambulancia" (AD) | La captura guarda bien el texto "SI"/"NO" (79 NO, 3 SI) | **El error está en la exportación**: el texto "NO" se evalúa como verdadero y sale "SI". La captura no se toca |
| RI: fecha de creación | `referencia_interna.fecha_inicio` (si falta, `created_at`) | |
| RI: examen coordinado | Gestión `EXAMEN COORDINADO` (19 filas; en detalles: `fecha`, `hora`, que pueden venir vacías) | |
| RI: programación de ambulancia | Gestión `CONFIRMACIÓN DE PROGRAMACIÓN DE AMBULANCIA` (168 filas; en detalles: `fecha_recogida`, `hora_recogida`, `empresa_ambulancia_nombre`) | |
| RI: sede CEDIM (M) | La tabla no tiene una columna de sede. Candidatas: `proveedor_prestador` o `servicio` | **Se confirma en Build leyendo los datos. Si ninguna es la sede, M queda vacía y se reporta** |
| Catálogo para SERVICIO RECEPTOR | Catálogo canónico de servicios o unidades (`catalogos`, tipo SERVICIO/UNIDAD) | Se reutiliza; no se crea uno nuevo |

## 2. Prioridad (A3): se elige la vía (b)
Desde ahora se guarda URGENTE / PRIORITARIA / ELECTIVA, y los valores antiguos se traducen al leerlos (ALTA/ALTO → URGENTE, MEDIA/MEDIO → PRIORITARIA, BAJA/BAJO → ELECTIVA) mediante una sola función compartida.

Por qué: no se reescribe el historial (el Knowledge exige conservar los datos históricos), no hace falta una migración de datos, y formularios, tarjetas, filtros y exportación usan la misma traducción. Los filtros aceptan tanto el valor nuevo como su equivalente antiguo.

Fuera de alcance: ALTO/MEDIO/CRÍTICO de las alertas y avisos de coordinación son severidad de alerta, no prioridad clínica. No se tocan.

## 3. Nueva definición de columnas
**ENTRANTES**: A:Z sin cambios. P se traduce con la tabla cerrada de 3.4; un código que no esté en la tabla sale tal cual y se reporta. U queda vacía cuando no hay código CRUE real.

**SALIENTES** (A–N, Q, V, W y AB mantienen su origen actual):
| Col | Encabezado | Origen |
|---|---|---|
| O | IPS RECEPTORA | Aceptación vigente |
| P | CIUDAD | Sede de la aceptación vigente |
| R | SERVICIO RECEPTOR | `servicio_receptor` de la aceptación vigente (nuevo) |
| S | FECHA Y HORA ACEPTACION | Fecha de la aceptación vigente |
| T | OPORTUNIDAD | S − B |
| U | FECHA Y HORA SOLICITUD AMBULANCIA | `fecha_solicitud_ambulancia` de la última gestión AMBULANCIA COORDINADA (nuevo) |
| V | EMPRESA DE TRASLADO | `empresa` de la gestión de ambulancia; si no hay, el dato actual |
| X | FECHA Y HORA TRASLADO | `fecha` + `hora` de la gestión de ambulancia |
| Y | OPORTUNIDAD TRASLADO | X − U |
| Z | ESTADO GENERAL | Tabla 3.2 (REMITIDO / SUSPENDIDO / EN GESTIÓN / POR DEFINIR) |
| AA | ESTADO DETALLADO | Estado completo de la plataforma |
| AC | CATEGORÍA DE OPORTUNIDAD | Prioridad traducida |
| AD | TIPO DE REFERENCIA | TRÁMITE ADMINISTRATIVO si K = RED NO CONTRATADA; en los demás casos, CLÍNICA |

**ATENCIÓN DOMICILIARIA**: M lleva solo el código; N la descripción (separada del valor guardado o tomada del archivo canónico CIE-10). P sale como "SI" solo cuando el valor guardado es SI. Nueva columna V: CATEGORÍA DE OPORTUNIDAD.

**REFERENCIAS INTERNAS** (estructura nueva):
| Col | Encabezado | Origen |
|---|---|---|
| A | FECHA Y HORA SOLICITUD | `fecha_inicio` / `created_at` |
| B | NUMERO DE IDENTIFICACION | documento |
| C | NOMBRES Y APELLIDOS | paciente |
| D | ENTIDAD | eapb |
| E | VX// EXAMEN | tipo_solicitud |
| F | ESPECIALIDAD SOLICITANTE | servicio |
| G | FECHA Y HORA DE VALORACION | Gestión EXAMEN COORDINADO (fecha + hora) |
| H | OPORTUNIDAD DE RESPUESTA | G − A |
| I | IPS QUE ACEPTA | Sede CEDIM (campo a confirmar, ver sección 1) |
| J | CIUDAD | "FLORENCIA - CAQUETÁ" |
| K | FECHA Y HORA SOLICITUD AMBULANCIA | Gestión de programación de ambulancia: recogida |
| L | AMBULANCIA DE TRASLADO | Empresa de esa misma gestión |
| M | TIPO DE AMBULANCIA | Se conserva |
| N | OBSERVACION | Se conserva |
| O | CATEGORÍA DE OPORTUNIDAD | Prioridad traducida |

Aviso: al eliminar columnas, las letras de Referencias Internas cambian. Los criterios CA7 (A, K–P) se verificarán con los encabezados nuevos de arriba.

## 4. Captura
- A1: nuevo selector obligatorio "Servicio receptor" en la gestión Aceptación de IPS receptora (se guarda en los detalles de esa gestión y se muestra en el Historial).
- A2: nuevo campo obligatorio "Fecha y hora de solicitud de ambulancia" en la gestión Ambulancia coordinada, con tres validaciones en pantalla y en el servidor: no antes de la aceptación vigente, no después del traslado coordinado, no en el futuro.
- A3: los selectores de prioridad pasan a URGENTE / PRIORITARIA / ELECTIVA.
- A4: la captura no se cambia (ya guarda bien); solo se corrige la exportación.

## 5. Plantilla e importador
La definición canónica sigue siendo la única fuente para exportar, descargar la plantilla e importar. El importador rechaza un archivo de Referencias Internas con la estructura anterior, con un mensaje claro. La plantilla conserva exactamente 4 hojas. La identidad, el fingerprint y el registro de importación no cambian.

## Detalles técnicos
- Archivos: `src/lib/gu-fr-50.ts` (columnas y detección de la estructura anterior de RI), `src/lib/gu-fr-50.server.ts` (mapeo y lectura por lotes de las gestiones por `caso_id`, reutilizando el resolver de `salientes-aceptacion`), `src/lib/entrantes-canonico.ts` (motivos de P y U), `src/components/remisiones/seguimiento-dialog.tsx` (A1, A2), nuevo `src/lib/prioridad.ts` (traducción compartida), los selectores y tarjetas de prioridad en `nuevo-registro-dialog.tsx`, `caso-remision-card.tsx`, `caso-generico-card.tsx`, `registrar-wizard.tsx`, `salientes-export.ts` e `historial-export.ts`, la validación server-side de las gestiones, `importar.functions.ts`, y el archivo de plantilla `gu-fr-50-v02.xlsx` (se regenera si sus encabezados son fijos).
- Migraciones: NINGUNA (los datos nuevos van en los detalles de las gestiones existentes).
- Pruebas vitest: estado general 3.2 (incluidos desistimientos y un estado desconocido), la regla de AD, S/T vacías sin aceptación, Y = X − U, la tabla de motivos de Entrantes, la separación CIE-10 de AD, "requiere ambulancia" con el texto "NO", la traducción de prioridad, la estructura nueva de RI y el rechazo de la anterior.
- Validaciones: línea base y resultado final de typecheck, tests, `bun run build` y ESLint; security scan.
