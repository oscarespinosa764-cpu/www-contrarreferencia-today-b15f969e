---
name: Knowledge CEDIM IPS
description: Reglas maestras del proyecto: módulos, roles, seguridad, identidad de casos, dominio Entrantes/CIE-10/edad/GU-FR-50, áreas cerradas y forma de trabajar
type: preference
---
KNOWLEDGE — CEDIM IPS · SISTEMA DE REFERENCIA Y CONTRARREFERENCIA

1. CONTEXTO
- Aplicación interna en producción (contrarreferencia.today) que maneja datos sensibles de pacientes. Sistema avanzado: no reconstruir lo que funciona.
- Stack: React 19 + TypeScript + TanStack Start/Router/Query + Vite + Tailwind + Supabase/Lovable Cloud. Rutas file-based en src/routes; no editar a mano el árbol generado de rutas.

2. ESTRUCTURA FUNCIONAL
- Módulos reales (4): ENTRANTES, SALIENTES, ATENCION_DOMICILIARIA, REFERENCIAS_INTERNAS. GENERAL es solo consolidación, no un módulo.
- Prohibido crear TRÁMITES en cualquier forma: módulo, tabla, hoja, ruta, contador, exportador o importador.
- Roles técnicos únicos: admin, operativa, temporal. "Coordinador de Referencia y Contrarreferencia" es un CARGO: nunca concede, oculta, muestra ni autoriza nada.
- Control de Mando: solo admin. Modo Práctica: intacto salvo orden expresa.

3. SEGURIDAD (NO NEGOCIABLE)
- RLS fail-closed; autorización server-side; sin service_role en frontend; Zod strict, allowlists y DTO estrictos; sin mass assignment; sin SQL/JS/HTML/CSS arbitrario.
- Nunca confiar en userId, role, cargo o actor enviados por el cliente.
- Ocultar en la interfaz no es autorizar: una acción no permitida debe ser imposible por URL directa, DevTools, payload modificado, RPC manual o Supabase desde el navegador.
- Escrituras sensibles solo mediante funciones server/RPC transaccionales (FOR UPDATE, idempotencia, rollback). No reabrir DML directo donde ya se revocó.
- Todo cambio se evalúa para admin, operativa, temporal, usuario inactivo y anon. Una sola implementación compartida; las diferencias se aplican solo por permisos. No ampliar ni restringir permisos sin orden expresa.

4. DATOS, IDENTIDAD E HISTORIA
- La identidad de un caso es su PK/ID estable. Documento, nombre, radicado, código de gestión, "NO APLICA", índice "CASO 1", estado o fecha son atributos, nunca identidad.
- Preservar historial, auditoría, documentos, firmas, QR, hashes, fingerprints, ledger, snapshots y datos legacy.
- Sin backfill especulativo. Un dato histórico solo se reconstruye con evidencia determinística; preferir eventos virtuales de lectura antes que escribir en la base.
- Trazabilidad operativa ≠ auditoría técnica. audit_logs solo entra en la trazabilidad mediante allowlist cerrada de acciones reales verificadas.
- Consultas acotadas a los IDs visibles y por lotes; nunca descargar todo el universo para filtrar en el cliente; sin N+1.

5. REGLAS DE DOMINIO VIGENTES
- Edad = edad_valor + edad_unidad (AÑOS/MESES/DÍAS), obligatoria en registros nuevos; nunca asumir AÑOS.
- CIE-10: componente Cie10Field y archivo canónico existente; el servidor valida el código y deriva la descripción; sin tabla CIE-10 duplicada.
- Entrantes con gestión previa: fecha y hora de remisión obligatorias; nunca inventar 00:00; los históricos solo con fecha se conservan.
- Ciudad y departamento se derivan de IPS → sede; sin captura manual duplicada.
- Clasificación de Entrantes por la MISMA solicitud: aceptación → ACEPTADO; negación → NEGADO; CRUE sin decisión → DIRECCIONAMIENTO CRUE; SIN_GESTION → INGRESO SIN GESTIÓN PREVIA DE REFERENCIA. Los estados operativos (REGISTRADO, INGRESADO, CANCELADO, CANCELADO_VENCIMIENTO) nunca van en la clasificación. CRUE puede ocurrir antes o después de la decisión; no crear conceptos como "momento/fase CRUE".
- unidad_prevista ≠ unidad_real (no sobrescribir; justificación obligatoria si difieren). Profesional aceptante ≠ profesional TEP. justificacion_decision ≠ justificacion_confirmacion. TEP manual se guarda como snapshot y no se inserta al catálogo.
- GU-FR-50: exactamente 4 hojas (ENTRANTES, SALIENTES, ATENCION DOMICILIARIA, REFERENCIAS INTERNAS), sin hojas auxiliares ni ocultas. Columnas A:Z de Entrantes congeladas salvo orden expresa.

6. CERRADO — NO REABRIR SALVO REGRESIÓN DEMOSTRADA
Login y sus mensajes de error; núcleo Entrantes B.1.2B (seguridad DML, atomicidad, privilegios); rendimiento de Historial; seguimientos de Salientes por caseId; línea de tiempo operativa compartida; dominio y DNS.

7. FORMA DE TRABAJAR
- Inspecciona antes de cambiar. Los nombres de tablas, funciones o archivos que aparezcan en un prompt son referencia, no garantía: usa el objeto real.
- DENTRO del alcance: si encuentras una brecha, corrígela en la misma ejecución. FUERA del alcance: no la toques; repórtala en "Hallazgos fuera de alcance".
- Cambio mínimo: el menor número de archivos; sin refactors no relacionados, migraciones vacías, componentes, hooks o fuentes duplicadas, ni documentación innecesaria.
- Actualiza todos los consumidores reales del comportamiento cambiado (pantalla, PDF, Excel, caché) para que no quede lógica anterior en ningún lugar.
- Pruebas: registra la línea base antes de cambiar; agrega solo las pruebas faltantes y que ejerzan la lógica real (no mocks que repliquen la implementación). Nunca crees, modifiques ni borres datos reales de pacientes para probar.
- Validaciones: npx tsgo --noEmit -p tsconfig.json · bunx vitest run · bun run build · ESLint en archivos modificados · linter de Supabase si hay cambios SQL/RPC/RLS/vistas/permisos · security scan en cambios sensibles. Los hallazgos preexistentes no relacionados se listan, no se corrigen.
- No declares cerrado sin evidencia. Estados finales válidos: CERRADO · TÉCNICAMENTE CERRADO — PENDIENTE VALIDACIÓN MANUAL · PARCIAL (solo si queda un defecto real después de intentar corregirlo). Tras el informe, detente; no inicies otra fase.
- No malgastes créditos.