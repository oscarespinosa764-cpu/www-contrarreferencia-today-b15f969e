// ---------------------------------------------------------------------------
// CRON — Evaluación automática de ALERTAS DE COORDINACIÓN (salientes).
//
// Recorre las remisiones activas y, según las reglas de coordinación vigentes
// (tabla reglas_coordinacion, subventana SALIENTES, activo=true), genera de
// forma AUTÓNOMA e IDEMPOTENTE las alertas por umbral temporal que ningún
// evento manual dispara:
//   - ALT-SAL-ALTA-SIN-ACEPTACION  (prioridad alta pendiente de aceptación)
//   - ALT-SAL-ACEPTADO-SIN-AMBULANCIA (aceptado sin ambulancia coordinada)
//   - ALT-SAL-AMBULANCIA-SIN-ARRIBO   (ambulancia sin arribo/entrega documental)
//   - ALT-SAL-SIN-SEGUIMIENTO-TURNO   (caso activo sin seguimiento por > 1 turno)
//
// Seguridad: ruta pública (/api/public/*) que EXIGE la anon key en el header
// `apikey`. Solo lectura/escritura server-side vía service role. No devuelve PII.
// Reutiliza la infraestructura existente (alertas_coordinacion, notifications).
// ---------------------------------------------------------------------------
import { createFileRoute } from "@tanstack/react-router";

type ReglaRow = {
  codigo: string;
  nombre: string | null;
  descripcion: string | null;
  modulo: string | null;
  subventana: string;
  prioridad: string;
  umbral: number | null;
  unidad: string | null;
  activo: boolean;
  archivado: boolean;
  notificar_externo: boolean | null;
  canales: string[] | null;
  requiere_crue: boolean | null;
};

type RemisionRow = {
  id: string;
  paciente: string | null;
  documento: string | null;
  prioridad: string | null;
  estado: string | null;
  codigo_radicacion: string | null;
  fecha_radicado: string | null;
  created_at: string;
  updated_at: string;
};

const norm = (s: string | null | undefined) =>
  (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase();

function umbralMs(umbral: number | null, unidad: string | null): number {
  if (umbral == null) return 0;
  switch (unidad) {
    case "min":
      return umbral * 60_000;
    case "horas":
      return umbral * 3_600_000;
    case "turnos":
      // Un turno operativo se aproxima a 12 horas.
      return umbral * 12 * 3_600_000;
    default:
      return umbral * 3_600_000;
  }
}

function esCerrado(estado: string | null): boolean {
  const e = norm(estado);
  return (
    e.includes("CERRAD") ||
    e.includes("EGRESAD") ||
    e.includes("CANCELAD") ||
    e.includes("DESISTIMIENTO GENERAL")
  );
}

export const Route = createFileRoute("/api/public/hooks/evaluar-alertas-coordinacion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const provided =
          request.headers.get("x-cron-secret") ||
          request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
          "";
        const expected = process.env.CRON_SHARED_SECRET || "";
        const enc = new TextEncoder();
        const a = enc.encode(provided);
        const b = enc.encode(expected);
        let equal = a.length === b.length && expected.length > 0;
        const len = Math.max(a.length, b.length);
        let diff = a.length ^ b.length;
        for (let i = 0; i < len; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
        if (diff !== 0) equal = false;
        if (!equal) {
          return new Response(JSON.stringify({ error: "Unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const ahora = Date.now();

        // 1) Reglas vigentes de salientes.
        const { data: reglasData, error: reglasErr } = await supabaseAdmin
          .from("reglas_coordinacion")
          .select(
            "codigo, nombre, descripcion, modulo, subventana, prioridad, umbral, unidad, activo, archivado, notificar_externo, canales, requiere_crue",
          )
          .eq("subventana", "SALIENTES")
          .eq("activo", true)
          .eq("archivado", false);
        if (reglasErr) throw reglasErr;
        const reglas = (reglasData ?? []) as ReglaRow[];
        const reglaPor = (codigo: string) => reglas.find((r) => r.codigo === codigo);

        // 2) Remisiones activas (no archivadas, no cerradas).
        const { data: remData, error: remErr } = await supabaseAdmin
          .from("remisiones")
          .select(
            "id, paciente, documento, prioridad, estado, codigo_radicacion, fecha_radicado, created_at, updated_at",
          )
          .eq("archivado", false);
        if (remErr) throw remErr;
        const remisiones = ((remData ?? []) as RemisionRow[]).filter(
          (r) => !esCerrado(r.estado),
        );

        // 3) Último seguimiento por caso (para ALT-SAL-SIN-SEGUIMIENTO-TURNO).
        const ultimoSeg = new Map<string, number>();
        const reglaSeg = reglaPor("ALT-SAL-SIN-SEGUIMIENTO-TURNO");
        if (reglaSeg && remisiones.length > 0) {
          const ids = remisiones.map((r) => r.id);
          const { data: segData } = await supabaseAdmin
            .from("seguimientos")
            .select("caso_id, created_at")
            .eq("archivado", false)
            .in("caso_id", ids);
          for (const s of (segData ?? []) as { caso_id: string; created_at: string }[]) {
            const t = new Date(s.created_at).getTime();
            const prev = ultimoSeg.get(s.caso_id) ?? 0;
            if (t > prev) ultimoSeg.set(s.caso_id, t);
          }
        }

        type Candidata = {
          codigo: string;
          regla: ReglaRow;
          rem: RemisionRow;
          eventoAt: string;
          mensaje: string;
        };
        const candidatas: Candidata[] = [];

        for (const rem of remisiones) {
          const estado = norm(rem.estado);
          const prioridadAlta = norm(rem.prioridad).includes("ALTA");
          const refCreada = new Date(rem.fecha_radicado ?? rem.created_at).getTime();
          const refActualizada = new Date(rem.updated_at).getTime();

          const pushSi = (codigo: string, condicion: boolean, refMs: number, msg: string) => {
            const regla = reglaPor(codigo);
            if (!regla || !condicion) return;
            if (ahora - refMs < umbralMs(regla.umbral, regla.unidad)) return;
            candidatas.push({
              codigo,
              regla,
              rem,
              eventoAt: new Date(refMs).toISOString(),
              mensaje: msg,
            });
          };

          // Regla 1: prioridad alta pendiente de aceptación.
          pushSi(
            "ALT-SAL-ALTA-SIN-ACEPTACION",
            prioridadAlta && estado.includes("PENDIENTE ACEPTAC"),
            refCreada,
            "Caso de prioridad alta pendiente de aceptación por encima del umbral.",
          );

          // Regla 3: aceptado sin ambulancia coordinada.
          pushSi(
            "ALT-SAL-ACEPTADO-SIN-AMBULANCIA",
            estado.includes("ACEPTADO SIN"),
            refActualizada,
            "Aceptación registrada sin ambulancia coordinada por encima del umbral.",
          );

          // Regla 4: ambulancia coordinada sin arribo / entrega documental.
          pushSi(
            "ALT-SAL-AMBULANCIA-SIN-ARRIBO",
            estado.includes("ACEPTADO CON AMBULANCIA"),
            refActualizada,
            "Ambulancia coordinada sin registro de arribo o entrega documental por encima del umbral.",
          );

          // Regla 2: caso activo sin seguimiento durante más de un turno.
          if (reglaSeg) {
            const ultimo = ultimoSeg.get(rem.id) ?? refCreada;
            pushSi(
              "ALT-SAL-SIN-SEGUIMIENTO-TURNO",
              true,
              ultimo,
              "Caso activo sin seguimiento válido durante más de un turno operativo.",
            );
          }
        }

        // 4) Inserción idempotente + despacho externo best-effort.
        let creadas = 0;
        let notificadas = 0;
        for (const c of candidatas) {
          const idempotencyKey = `${c.codigo}:${c.rem.id}`;
          const { data: existente } = await supabaseAdmin
            .from("alertas_coordinacion")
            .select("id")
            .eq("idempotency_key", idempotencyKey)
            .maybeSingle();
          if (existente) continue;

          const { error: insErr } = await supabaseAdmin
            .from("alertas_coordinacion")
            .insert({
              codigo: c.codigo,
              nombre: c.regla.nombre,
              descripcion: c.regla.descripcion,
              modulo: c.regla.modulo ?? "REMISIONES",
              subventana: "SALIENTES",
              prioridad: c.regla.prioridad,
              mensaje: c.mensaje,
              caso_codigo: c.rem.codigo_radicacion,
              caso_documento: c.rem.documento,
              estado: "ABIERTA",
              idempotency_key: idempotencyKey,
              evento_at: c.eventoAt,
              detalles: { origen: "cron", remision_id: c.rem.id } as never,
              created_by: null,
            });
          if (insErr) {
            // Carrera → índice único: ya existe, no es error real.
            if ((insErr as { code?: string }).code === "23505") continue;
            throw insErr;
          }
          creadas++;

          // Despacho externo si la regla lo pide.
          if (c.regla.notificar_externo && (c.regla.canales?.length ?? 0) > 0) {
            try {
              const { despacharAlertaCoordinacion } = await import(
                "@/lib/notifications.server"
              );
              const res = await despacharAlertaCoordinacion(supabaseAdmin, {
                canales: c.regla.canales as string[],
                requiereCrue: !!c.regla.requiere_crue,
                referenceId: idempotencyKey,
                module: c.regla.modulo ?? "REMISIONES",
                userId: "cron",
                vars: {
                  tipo_alerta: c.regla.nombre ?? c.codigo,
                  modulo: c.regla.modulo ?? "REMISIONES",
                  codigo: c.rem.codigo_radicacion ?? "",
                  estado: c.rem.estado ?? "",
                  accion: c.mensaje,
                  fecha_hora: new Date().toLocaleString("es-CO"),
                },
              });
              if (res.enviados > 0) notificadas++;
            } catch {
              // Best-effort: la alerta ya quedó registrada.
            }
          }
        }

        return new Response(
          JSON.stringify({
            ok: true,
            evaluadas: remisiones.length,
            candidatas: candidatas.length,
            creadas,
            notificadas,
            ts: new Date().toISOString(),
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      },
    },
  },
});
