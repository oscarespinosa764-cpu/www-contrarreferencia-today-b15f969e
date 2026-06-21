# Plantillas de trazabilidad ÍNDIGO — Dashboard operativo salientes

Objetivo: generar plantillas de TEXTO PLANO (para copiar/pegar en ÍNDIGO) al crear un caso saliente y al hacer seguimientos de radicación. No se toca remisiones entrantes, ni login/roles/RLS/seguridad. Sin HTML, sin formato oficio, sin negrillas/colores, sin botón WhatsApp. Solo botón “Copiar para Índigo”.

## Alcance (qué se toca)
- Catálogos EAPB/ERP: 2 atributos nuevos.
- Catálogos: nuevas listas administrables (IPS local, departamentos, tipos de trámite).
- Formulario "Nuevo registro → Remisión" (saliente).
- Diálogo de seguimiento (tipo "Radicación en plataforma").
- Nuevo módulo de generación de plantillas en texto plano.
- 1 migración aditiva (no destructiva).

## 1. Migración de base de datos (aditiva, sin borrar nada)
Nuevas columnas en `remisiones` (todas nullable, compatibles con datos existentes):
- `eapb` text — EAPB/ERP seleccionada (hoy el form no la captura).
- `alcance_red` text — "LOCAL" | "LOCAL_NACIONAL".
- `ips_red_local` text — IPS marcadas, separadas por coma.
- `departamentos_red_nacional` text — departamentos marcados, separados por coma.
- `eapb_tiene_plataforma` boolean.
- `eapb_genera_codigo` boolean.
- `plataforma_funcionando` boolean (null si no aplica).
- `trazabilidad_indigo` text — plantilla inicial generada (editada).

`codigo_radicacion` (ya existe) se usa para "PENDIENTE DE RADICACIÓN" / "NO APLICA" / código real.

Atributos EAPB en catálogo: se reutilizan las columnas existentes `extra1`/`extra2` de `catalogos` para tipo `EAPB`:
- `extra1` = "Tiene plataforma" ("SI"/"NO")
- `extra2` = "Genera código de radicación" ("SI"/"NO")

Seed de catálogos nuevos (vía INSERT, no destructivo, con ON CONFLICT/condicional):
- tipo `TIPO_TRAMITE`: Remisión asistencial normal; Remisión por trámite administrativo cancelable; Remisión asistencial por SOAT; Remisión asistencial normal con falla de plataforma.
- tipo `IPS_LOCAL`: Clínica Medilaser Florencia; Hospital María Inmaculada Florencia.
- tipo `DEPARTAMENTO`: Huila; Tolima; Cundinamarca; Nariño; Cauca; Valle del Cauca; Atlántico; Antioquia.

GRANTs ya existen para `catalogos`/`remisiones`; no se cambian políticas RLS.

## 2. Catálogo EAPB/ERP (catalogo-maestras.tsx)
Para tipo `EAPB`, mostrar `extra1Label = "Tiene plataforma (SI/NO)"` y `extra2Label = "Genera código de radicación (SI/NO)"` como selects SI/NO (en vez de texto libre). No se agrega nombre de plataforma ni observaciones. Otros tipos quedan igual.

## 3. Formulario Remisión saliente (nuevo-registro-dialog.tsx)
Agregar al tab "Remisión":
- Select **EAPB/ERP** (desde catálogo EAPB). Al elegir, se leen sus flags `tiene_plataforma` y `genera_codigo`.
- Si `tiene_plataforma = SI` y NO es SOAT: pregunta obligatoria **¿La plataforma se encuentra funcionando? (Sí/No)**.
- Campo obligatorio **Tipo de trámite** (desde catálogo TIPO_TRAMITE).
- Campo obligatorio **Alcance de gestión**: Red local | Red local + red nacional.
- Si alcance incluye local: checkboxes de **IPS locales** (catálogo IPS_LOCAL), mínimo 1.
- Si alcance incluye nacional: checkboxes de **departamentos** (catálogo DEPARTAMENTO) + "Otro" con campo de texto, mínimo 1.
- `codigo_radicacion` NO se digita aquí: se guarda "PENDIENTE DE RADICACIÓN" (si genera código) o "NO APLICA" (si no genera).
- Fecha/hora de inicio y radicación siguen como están (no editables / automáticas).

Al guardar el caso, se persisten los nuevos campos y se abre la **ventana de plantilla inicial**.

## 4. Generador de plantillas (nuevo archivo src/lib/indigo-trazabilidad.ts)
Función pura que recibe los datos del caso y devuelve string de texto plano, eligiendo la plantilla 8.1–8.11 según: tipo de pagador (EAPB vs SOAT), tipo de trámite, tiene_plataforma, plataforma_funcionando, alcance (local / local+nacional). Reemplaza variables `{{ips_red_local}}`, `{{departamentos_red_nacional}}`, `{{codigo_radicacion}}`, etc. Incluye:
- Las 11 plantillas iniciales exactas del requerimiento.
- Notas aclaratorias (sección 9) con placeholders visibles si faltan datos.
- Plantillas de seguimiento de radicación (10.1, 10.2, 10.3) y plantilla especial 8.12.
Todo en MAYÚSCULAS/texto plano, sin HTML.

## 5. Ventana de plantilla inicial (nuevo componente indigo-panel.tsx)
Modal con:
- Título: "INICIO DE TRÁMITE DE REMISIÓN - TRAZABILIDAD ÍNDIGO".
- `Textarea` editable con la plantilla generada.
- Botón **Copiar para Índigo** (copia `textarea.value` como texto plano vía `navigator.clipboard.writeText`).
- Botón **Regenerar plantilla** (re-aplica el generador descartando ediciones).
- Botón **Cerrar / Continuar**.
Reutilizable también para mostrar la plantilla desde la tarjeta del caso.

## 6. Seguimiento "Radicación en plataforma" (seguimiento-dialog.tsx)
- Agregar tipo "Radicación en plataforma" a la lista de tipos.
- Si EAPB `genera_codigo = SI`: campo **Código de radicación** obligatorio; al guardar actualiza `codigo_radicacion` del caso.
- Generar plantilla 10.1 (o 10.2 si la plataforma estaba caída) en `Textarea` editable + botón "Copiar para Índigo".
- Si `genera_codigo = NO`: no exigir código; plantilla 10.3.
- Plantilla especial 8.12 disponible como opción de seguimiento editable.

## 7. Auditoría (sección 12)
Llamar `registrar_auditoria` (función ya existente) en: creación de caso saliente, generación de plantilla inicial, seguimiento de radicación y registro/modificación de código. Sin datos sensibles ni claves en logs. No se cambia la lógica de auditoría existente.

## Detalles técnicos
- Todo el texto se genera con un módulo TS puro (`indigo-trazabilidad.ts`); el panel solo muestra/edita/copa.
- "Copiar para Índigo" usa `navigator.clipboard.writeText(value)` — siempre texto plano.
- No se importa nada de `oficio.ts` ni de los componentes de entrantes; cero cambios en entrantes.
- Migración 100% aditiva; los casos antiguos quedan con los nuevos campos en null y la app los maneja con defaults.

## Pruebas recomendadas
1. Catálogo: marcar EAPB con/sin plataforma y con/sin código.
2. Crear caso EAPB con plataforma funcionando + red local → plantilla 8.1.
3. EAPB con plataforma caída + local+nacional → plantilla 8.8 (sin exigir código).
4. SOAT + local → plantilla 8.5 (sin hablar de plataforma/código).
5. Trámite administrativo con plataforma → 8.9; sin plataforma → 8.10.
6. Seguimiento "Radicación en plataforma" con EAPB que genera código → exige código y plantilla 10.1.
7. Verificar que "Copiar para Índigo" pega texto plano y que NO existe botón WhatsApp.
8. Confirmar que remisiones entrantes no cambió.
