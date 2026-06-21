import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  EVO_CANALES,
  canalesFaltantes,
  evolucionFromDetalle,
  evolucionMeta,
  fmtFechaHora,
  parseEvolucionDetalle,
  splitEspecialidades,
  type EvoEspecialidad,
} from "@/lib/remisiones-utils";
import { toast } from "sonner";
import { PlantillasEnPaso } from "@/components/coordinacion/plantillas-en-paso";
import { Copy } from "lucide-react";
import { generarPlantillaRadicacion, type RadicacionTipo } from "@/lib/indigo-trazabilidad";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  casoId: string;
  tipoCaso: string;
  paciente: string;
  documento?: string | null;
  evolucionActual?: string | null;
  /** JSON con el detalle de evolución por especialidad. */
  evolucionDetalle?: string | null;
  /** Especialidades tratantes/remisoras (texto separado por comas). */
  especialidades?: string | null;
  /** Radicado guardado en el caso. */
  radicadoCaso?: string | null;
  /** Tabla a actualizar para la evolución del caso (remisiones, domiciliarios, etc.). */
  tabla?: string;
  /** Opciones de estado del caso (solo remisiones y PHD lo cambian desde aquí). */
  estadoOpciones?: string[];
  /** Estado actual del caso. */
  estadoActual?: string | null;
};

// Lista fusionada: tipos de seguimiento del sistema actual + modalidades de gestión de Indigo.
const RADICACION_TIPO = "Radicación en plataforma";
const TIPOS_SEG = [
  "Radicado / inicio trámite de remisión",
  RADICACION_TIPO,
  "Telefónico / celular",
  "Correo electrónico",
  "Plataforma web",
  "Físico o presencial",
  "Llamada a IPS receptora",
  "Respuesta de IPS",
  "Gestión ambulancia",
  "Actualización clínica",
  "Contacto familiar",
  "Otro",
];

const ESTADOS_SOLICITUD = ["Sí acepta", "No acepta", "Pendiente", "No aplica"];

export function SeguimientoDialog({
  open,
  onOpenChange,
  casoId,
  tipoCaso,
  paciente,
  documento,
  evolucionDetalle,
  especialidades,
  radicadoCaso,
  tabla,
  estadoOpciones,
  estadoActual,
}: Props) {
  const qc = useQueryClient();
  const especialidadesList = useMemo(() => splitEspecialidades(especialidades), [especialidades]);

  const [nuevoRadicado, setNuevoRadicado] = useState(false);
  const [noAplicaRadicado, setNoAplicaRadicado] = useState(false);
  const [radicado, setRadicado] = useState("");
  const [tipoSeg, setTipoSeg] = useState("");
  const [detalle, setDetalle] = useState("");
  const [estadoSolicitud, setEstadoSolicitud] = useState("");
  const [nombreContacto, setNombreContacto] = useState("");
  const [telefono, setTelefono] = useState("");
  const [evoDetalle, setEvoDetalle] = useState<Record<string, EvoEspecialidad>>({});
  // Snapshot de lo ya guardado: los canales en true quedan bloqueados.
  const [inicial, setInicial] = useState<Record<string, EvoEspecialidad>>({});
  const [motivoEvo, setMotivoEvo] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyEvo, setBusyEvo] = useState(false);
  const [estadoCaso, setEstadoCaso] = useState("");

  // Inicializar el checklist por especialidad al abrir.
  useEffect(() => {
    if (open) {
      const parsed = parseEvolucionDetalle(evolucionDetalle, especialidadesList);
      setEvoDetalle(parsed);
      setInicial(parseEvolucionDetalle(evolucionDetalle, especialidadesList));
      setMotivoEvo("");
      setEstadoCaso(estadoActual ?? "");
    }
  }, [open, evolucionDetalle, especialidadesList, estadoActual]);

  const { data: historial } = useQuery({
    queryKey: ["seguimientos-caso", casoId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("seguimientos")
        .select("*")
        .eq("caso_id", casoId)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  // Flags ÍNDIGO del caso (solo remisiones): genera código / plataforma caída.
  const { data: casoFlags } = useQuery({
    queryKey: ["remision-indigo-flags", casoId],
    enabled: open && tabla === "remisiones",
    queryFn: async () => {
      const { data } = await supabase
        .from("remisiones")
        .select("eapb_genera_codigo, plataforma_funcionando")
        .eq("id", casoId)
        .maybeSingle();
      return data as { eapb_genera_codigo: boolean | null; plataforma_funcionando: boolean | null } | null;
    },
  });

  const esRadicacion = tipoSeg === RADICACION_TIPO;
  const generaCodigo = casoFlags?.eapb_genera_codigo === true;
  const plataformaFueCaida = casoFlags?.plataforma_funcionando === false;
  const radicacionTipo: RadicacionTipo = !generaCodigo
    ? "sin_codigo"
    : plataformaFueCaida
      ? "plataforma_restablecida"
      : "con_codigo";

  const radicadoExistente =
    radicadoCaso?.trim() || (historial ?? []).find((h) => h.radicado)?.radicado || "";
  const radicadoEnUso = noAplicaRadicado
    ? "No aplica"
    : nuevoRadicado || !radicadoExistente
      ? radicado
      : radicadoExistente;

  const isLocked = (esp: string, key: keyof EvoEspecialidad) => !!inicial[esp]?.[key];

  const toggleEvo = (esp: string, key: keyof EvoEspecialidad) => {
    if (isLocked(esp, key)) return; // No se puede desmarcar lo ya guardado.
    setEvoDetalle((prev) => ({
      ...prev,
      [esp]: { ...prev[esp], [key]: !prev[esp]?.[key] },
    }));
  };

  const evolucionCalc = evolucionFromDetalle(evoDetalle);
  const metaCalc = evolucionMeta[evolucionCalc];
  const faltan = canalesFaltantes(evoDetalle);
  const requiereMotivo = evolucionCalc === "parcial";

  // Crea, actualiza o archiva el pendiente automático de evolución.
  const sincronizarPendiente = async (uid: string | undefined) => {
    const { data: existentes } = await supabase
      .from("pendientes")
      .select("id")
      .eq("caso_id", casoId)
      .eq("origen", "evolucion")
      .eq("archivado", false);
    const ids = (existentes ?? []).map((e) => e.id);

    if (evolucionCalc === "parcial") {
      const payload = {
        tipo_pendiente: "Evolución pendiente",
        paciente_asunto: documento ? `${paciente} · ${documento}` : paciente,
        prioridad: "ALTA",
        estado: "ABIERTO",
        observacion_entrega:
          `Falta: ${faltan.join(", ") || "—"}.` + (motivoEvo.trim() ? ` Motivo: ${motivoEvo.trim()}` : ""),
        fecha: new Date().toISOString().slice(0, 10),
        caso_id: casoId,
        tipo_caso: tipoCaso,
        origen: "evolucion",
      };
      if (ids.length > 0) {
        await supabase.from("pendientes").update(payload).eq("id", ids[0]);
        if (ids.length > 1)
          await supabase.from("pendientes").update({ archivado: true }).in("id", ids.slice(1));
      } else {
        await supabase.from("pendientes").insert({ ...payload, created_by: uid });
      }
    } else if (ids.length > 0) {
      // Completo o sin evolucionar → se elimina (archiva) el pendiente.
      await supabase.from("pendientes").update({ archivado: true }).in("id", ids);
    }
  };

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["seguimientos-caso", casoId] });
    qc.invalidateQueries({ queryKey: ["remisiones"] });
    qc.invalidateQueries({ queryKey: ["domiciliarios"] });
    qc.invalidateQueries({ queryKey: ["referencia-interna"] });
    qc.invalidateQueries({ queryKey: ["pendientes-rem"] });
    qc.invalidateQueries({ queryKey: ["pendientes"] });
    qc.invalidateQueries({ queryKey: ["seguimientos-ult"] });
  };

  const guardar = async () => {
    if (!tipoSeg) {
      toast.error("Selecciona el tipo de seguimiento");
      return;
    }
    if (requiereMotivo && !motivoEvo.trim()) {
      toast.error("Indica el motivo de la evolución pendiente");
      return;
    }
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: perfil } = await supabase
      .from("profiles")
      .select("nombre")
      .eq("user_id", u.user?.id ?? "")
      .maybeSingle();

    const { error } = await supabase.from("seguimientos").insert({
      caso_id: casoId,
      tipo_caso: tipoCaso,
      radicado: radicadoEnUso || null,
      tipo_seguimiento: tipoSeg,
      detalle: detalle || null,
      estado_solicitud: estadoSolicitud || null,
      nombre_contacto: nombreContacto.trim() || null,
      telefono: telefono.trim() || null,
      nombre_usuario: perfil?.nombre || u.user?.email || null,
      created_by: u.user?.id,
    });
    if (error) {
      toast.error(error.message);
      setBusy(false);
      return;
    }

    if (tabla) {
      const update: {
        evolucion: string;
        evolucion_detalle?: string;
        evolucion_actualizada_at?: string;
        evolucion_motivo?: string | null;
        codigo_radicacion?: string;
        estado?: string;
      } = { evolucion: evolucionCalc };
      if (especialidadesList.length > 0) {
        update.evolucion_detalle = JSON.stringify(evoDetalle);
        update.evolucion_actualizada_at = new Date().toISOString();
        update.evolucion_motivo = requiereMotivo ? motivoEvo.trim() : null;
      }
      if (radicadoEnUso) update.codigo_radicacion = radicadoEnUso;
      if (estadoOpciones && estadoCaso) update.estado = estadoCaso;
      await supabase
        .from(tabla as "remisiones")
        .update(update)
        .eq("id", casoId);
      if (especialidadesList.length > 0) await sincronizarPendiente(u.user?.id);
    }

    toast.success("Seguimiento registrado");
    setDetalle("");
    setTipoSeg("");
    setEstadoSolicitud("");
    setNombreContacto("");
    setTelefono("");
    setNuevoRadicado(false);
    setBusy(false);
    refrescar();
  };

  // Guarda únicamente la evolución por especialidad, sin exigir tipo de seguimiento.
  const guardarEvolucion = async () => {
    if (!tabla) return;
    if (especialidadesList.length === 0) {
      toast.error("No hay especialidades tratantes registradas en este caso.");
      return;
    }
    if (requiereMotivo && !motivoEvo.trim()) {
      toast.error("Indica el motivo de la evolución pendiente");
      return;
    }
    setBusyEvo(true);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase
      .from(tabla as "remisiones")
      .update({
        evolucion: evolucionCalc,
        evolucion_detalle: JSON.stringify(evoDetalle),
        evolucion_actualizada_at: new Date().toISOString(),
        evolucion_motivo: requiereMotivo ? motivoEvo.trim() : null,
      })
      .eq("id", casoId);
    if (error) {
      toast.error(error.message);
      setBusyEvo(false);
      return;
    }
    await sincronizarPendiente(u.user?.id);
    toast.success("Evolución guardada");
    setBusyEvo(false);
    refrescar();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Seguimiento · {paciente}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Número de radicado */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Número de radicado
            </Label>
            {radicadoExistente && !nuevoRadicado && !noAplicaRadicado ? (
              <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/40 px-3 py-2">
                <span className="text-sm font-medium">{radicadoExistente}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => setNuevoRadicado(true)}
                >
                  Agregar nuevo radicado
                </Button>
              </div>
            ) : (
              <Input
                value={radicado}
                onChange={(e) => setRadicado(e.target.value)}
                placeholder="Ej. 2026-000123"
                disabled={noAplicaRadicado}
              />
            )}
            {/* "No aplica" solo cuando aún no hay radicado generado/guardado. */}
            {!radicadoExistente && (
              <label className="flex items-center gap-2 pt-1 text-xs text-muted-foreground">
                <Checkbox
                  checked={noAplicaRadicado}
                  onCheckedChange={(v) => setNoAplicaRadicado(!!v)}
                />
                No aplica (esta EPS no genera radicado)
              </label>
            )}
          </div>

          {/* Estado del caso (solo remisiones y PHD) */}
          {estadoOpciones && estadoOpciones.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Estado del caso
              </Label>
              <Select value={estadoCaso} onValueChange={setEstadoCaso}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar estado…" />
                </SelectTrigger>
                <SelectContent>
                  {estadoOpciones.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">
                El estado del caso solo se cambia desde aquí.
              </p>
            </div>
          )}


          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tipo de seguimiento
            </Label>
            <Select value={tipoSeg} onValueChange={setTipoSeg}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {TIPOS_SEG.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Estado de la solicitud (Indigo) */}
          <div className="space-y-1.5">
            <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Estado de la solicitud
            </Label>
            <Select value={estadoSolicitud} onValueChange={setEstadoSolicitud}>
              <SelectTrigger>
                <SelectValue placeholder="Seleccionar…" />
              </SelectTrigger>
              <SelectContent>
                {ESTADOS_SOLICITUD.map((e) => (
                  <SelectItem key={e} value={e}>
                    {e}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Contacto y teléfono (Indigo) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Nombre de contacto
              </Label>
              <Input
                value={nombreContacto}
                onChange={(e) => setNombreContacto(e.target.value)}
                placeholder="Nombre del contacto"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Teléfono
              </Label>
              <Input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Teléfono"
                inputMode="tel"
                maxLength={30}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Observaciones
              </Label>
              <PlantillasEnPaso
                paso="salientes_seguimiento"
                condicion={tipoSeg}
                datos={{
                  PACIENTE: paciente,
                  DOCUMENTO: documento,
                  RADICADO: radicadoEnUso,
                  ESPECIALIDAD: especialidadesList.join(", "),
                  ESTADO: estadoCaso,
                }}
                onUsar={(texto) => setDetalle((d) => (d.trim() ? `${d}\n${texto}` : texto))}
              />
            </div>
            <Textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={3} />
          </div>

          <Button className="w-full rounded-full" disabled={busy} onClick={guardar}>
            {busy ? "Guardando…" : "Registrar seguimiento"}
          </Button>


          {/* Evolución diaria por especialidad */}
          <div className="space-y-2 rounded-lg border border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Evolución diaria
              </Label>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${metaCalc.chip}`}>
                  <span className={`h-2 w-2 rounded-full ${metaCalc.dot}`} />
                  {metaCalc.label}
                </span>
                {tabla && especialidadesList.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 rounded-full px-3 text-xs"
                    disabled={busyEvo}
                    onClick={guardarEvolucion}
                  >
                    {busyEvo ? "Guardando…" : "Guardar"}
                  </Button>
                )}
              </div>
            </div>
            {especialidadesList.length === 0 ? (
              <p className="py-2 text-center text-xs italic text-muted-foreground">
                No hay especialidades tratantes registradas en este caso.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-[1fr_5rem_5rem_5rem] items-end gap-x-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <span>Especialidad</span>
                  {EVO_CANALES.map((c) => (
                    <span key={c.key} className="text-center leading-tight">
                      {c.label}
                    </span>
                  ))}
                </div>
                {especialidadesList.map((esp) => (
                  <div key={esp} className="grid grid-cols-[1fr_5rem_5rem_5rem] items-center gap-x-1">
                    <span className="truncate text-sm text-foreground">{esp}</span>
                    {EVO_CANALES.map((c) => (
                      <div key={c.key} className="flex justify-center">
                        <Checkbox
                          checked={!!evoDetalle[esp]?.[c.key]}
                          disabled={isLocked(esp, c.key)}
                          onCheckedChange={() => toggleEvo(esp, c.key)}
                        />
                      </div>
                    ))}
                  </div>
                ))}
                <p className="pt-1 text-[10px] text-muted-foreground">
                  Índigo = sistema · EAPB Correo = enviada por correo · EAPB Plataforma = cargada en plataforma. Lo ya
                  guardado queda bloqueado.
                </p>

                {requiereMotivo && (
                  <div className="space-y-1.5 pt-1">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-status-amber">
                      Motivo del pendiente {faltan.length ? `(falta ${faltan.join(", ")})` : ""}
                    </Label>
                    <Textarea
                      value={motivoEvo}
                      onChange={(e) => setMotivoEvo(e.target.value)}
                      rows={2}
                      placeholder="¿Por qué queda pendiente la evolución?"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Historial: solo los 2 últimos seguimientos */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Últimos seguimientos
            </p>
            {(historial?.length ?? 0) === 0 ? (
              <p className="rounded-md border border-dashed border-border py-6 text-center text-sm italic text-muted-foreground">
                Sin seguimientos registrados.
              </p>
            ) : (
              <div className="space-y-2">
                {historial!.slice(0, 2).map((h) => (
                  <div key={h.id} className="rounded-lg border border-border bg-card p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-foreground">{h.tipo_seguimiento || "Seguimiento"}</span>
                      <span className="text-[11px] text-muted-foreground">{fmtFechaHora(h.created_at)}</span>
                    </div>
                    {h.estado_solicitud && (
                      <span className="mt-1 inline-block rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-foreground">
                        {h.estado_solicitud}
                      </span>
                    )}
                    {h.detalle && <p className="mt-1 text-xs text-muted-foreground">{h.detalle}</p>}
                    {(h.nombre_contacto || h.telefono) && (
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        Contacto: {h.nombre_contacto || "—"}
                        {h.telefono ? ` · ${h.telefono}` : ""}
                      </p>
                    )}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {h.radicado ? `Radicado ${h.radicado} · ` : ""}
                      {h.nombre_usuario || "—"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
