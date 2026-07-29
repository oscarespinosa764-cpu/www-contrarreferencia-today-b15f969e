// ---------------------------------------------------------------------------
// Bloque canónico "EVOLUCIÓN DIARIA".
//
// Replica la implementación de REMISIONES (canales EAPB correo/plataforma,
// motivo del pendiente, especialidades tratantes) y reutiliza los generadores
// oficiales de plantilla Índigo. Se usa tanto en salientes como en el modal de
// PHD / PAD / O2 / Especiales para que exista una sola estructura, validación y
// plantilla en toda la aplicación.
// ---------------------------------------------------------------------------
import { useEffect } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DictationTextarea } from "@/components/voz/dictation-textarea";
import { evolucionMeta, type EvolucionEstado } from "@/lib/remisiones-utils";
import {
  generarPlantillaEvolucionDiaria,
  generarPlantillaEvolucionEspecialidades,
} from "@/lib/indigo-trazabilidad";

export type EvolucionDiariaValue = {
  correo: boolean;
  plataforma: boolean;
  /** ¿La plataforma de la EAPB está funcionando? Solo si la EAPB usa plataforma. */
  plataformaFunc: "" | "SI" | "NO";
  motivoPend: string;
  /** Especialidades tratantes marcadas como evolucionadas. */
  esp: Record<string, boolean>;
};

export const EVOLUCION_DIARIA_INICIAL: EvolucionDiariaValue = {
  correo: false,
  plataforma: false,
  plataformaFunc: "",
  motivoPend: "",
  esp: {},
};

export type EvolucionDiariaContexto = {
  /** La EAPB del caso hace seguimientos en plataforma. */
  segEnPlataforma: boolean;
  especialidades?: string[];
  estadoCaso?: string | null;
  esTramiteAdministrativo?: boolean;
  /** Observación manual (usada en la plantilla por especialidades). */
  observacion?: string;
};

export type EvolucionDiariaDerivado = {
  estado: EvolucionEstado;
  meta: { label: string; dot: string; chip: string };
  requiereMotivo: boolean;
  evolucionadas: string[];
  pendientes: string[];
  errores: string[];
  plantilla: string;
};

export function derivarEvolucionDiaria(
  v: EvolucionDiariaValue,
  ctx: EvolucionDiariaContexto,
): EvolucionDiariaDerivado {
  const especialidades = ctx.especialidades ?? [];
  const estado: EvolucionEstado = ctx.segEnPlataforma
    ? ((v.correo ? 1 : 0) + (v.plataforma ? 1 : 0) === 0
        ? "sin"
        : (v.correo ? 1 : 0) + (v.plataforma ? 1 : 0) === 1
          ? "parcial"
          : "completo")
    : v.correo
      ? "completo"
      : "sin";

  const requiereMotivo = ctx.segEnPlataforma && estado === "parcial";
  const evolucionadas = especialidades.filter((e) => v.esp[e]);
  const pendientes = especialidades.filter((e) => !v.esp[e]);

  const errores: string[] = [];
  if (!v.correo && !v.plataforma) errores.push("Seleccione al menos un canal de evolución.");
  if (ctx.segEnPlataforma && !v.plataformaFunc)
    errores.push("Indique si la plataforma de la EAPB está funcionando.");
  if (requiereMotivo && !v.motivoPend.trim())
    errores.push("Indique el motivo del canal pendiente.");

  const plantilla =
    especialidades.length > 0
      ? generarPlantillaEvolucionEspecialidades({
          evolucionadas,
          pendientes,
          enviadoCorreo: v.correo,
          enviadoPlataforma: ctx.segEnPlataforma ? v.plataforma : false,
          observacion: ctx.observacion,
        })
      : generarPlantillaEvolucionDiaria({
          estadoCaso: ctx.estadoCaso ?? null,
          esTramiteAdministrativo: ctx.esTramiteAdministrativo === true,
          tienePlataforma: ctx.segEnPlataforma,
          plataformaFunciona: ctx.segEnPlataforma ? v.plataformaFunc === "SI" : null,
          enviadoCorreo: v.correo,
          enviadoPlataforma: v.plataforma,
          motivoPendiente: v.motivoPend,
        });

  return {
    estado,
    meta: evolucionMeta[estado],
    requiereMotivo,
    evolucionadas,
    pendientes,
    errores,
    plantilla,
  };
}

const labelCls = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const espMeta: Record<string, { chip: string; dot: string }> = {
  COMPLETA: { chip: "bg-status-green/15 text-status-green", dot: "bg-status-green" },
  PARCIAL: { chip: "bg-status-amber/15 text-status-amber", dot: "bg-status-amber" },
  PENDIENTE: { chip: "bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};

export function EvolucionDiariaFields({
  value,
  onChange,
  ctx,
  derivado,
}: {
  value: EvolucionDiariaValue;
  onChange: (v: EvolucionDiariaValue) => void;
  ctx: EvolucionDiariaContexto;
  derivado: EvolucionDiariaDerivado;
}) {
  const especialidades = ctx.especialidades ?? [];
  const set = (patch: Partial<EvolucionDiariaValue>) => onChange({ ...value, ...patch });

  // Autollenado del motivo "PLATAFORMA NO FUNCIONAL" (Caso B canónico).
  useEffect(() => {
    const casoB = value.correo && !value.plataforma && value.plataformaFunc === "NO";
    if (casoB && !value.motivoPend.trim()) set({ motivoPend: "PLATAFORMA NO FUNCIONAL" });
    else if (!casoB && value.motivoPend === "PLATAFORMA NO FUNCIONAL") set({ motivoPend: "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.correo, value.plataforma, value.plataformaFunc]);

  const espEstado: "COMPLETA" | "PARCIAL" | "PENDIENTE" =
    especialidades.length === 0
      ? "PENDIENTE"
      : derivado.evolucionadas.length === especialidades.length
        ? "COMPLETA"
        : derivado.evolucionadas.length > 0
          ? "PARCIAL"
          : "PENDIENTE";

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={labelCls}>Evolución diaria</p>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${derivado.meta.chip}`}
        >
          <span className={`h-2 w-2 rounded-full ${derivado.meta.dot}`} />
          {derivado.meta.label.toUpperCase()}
        </span>
      </div>

      {ctx.segEnPlataforma && (
        <div className="space-y-1.5">
          <Label className={labelCls}>¿Plataforma EAPB funcionando?</Label>
          <Select
            value={value.plataformaFunc}
            onValueChange={(v) => set({ plataformaFunc: v as "SI" | "NO" })}
          >
            <SelectTrigger>
              <SelectValue placeholder="Seleccionar…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SI">Sí</SelectItem>
              <SelectItem value="NO">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={value.correo} onCheckedChange={(v) => set({ correo: !!v })} />
          EAPB CORREO
        </label>
        {ctx.segEnPlataforma && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={value.plataforma} onCheckedChange={(v) => set({ plataforma: !!v })} />
            EAPB PLATAFORMA
          </label>
        )}
      </div>

      {derivado.requiereMotivo && (
        <div className="space-y-1.5">
          <Label className={labelCls}>
            Motivo del pendiente ({value.correo ? "falta plataforma" : "falta correo"})
          </Label>
          <DictationTextarea
            dictationKey="salientes.seguimiento.motivo_pendiente"
            value={value.motivoPend}
            onChange={(e) => set({ motivoPend: e.target.value })}
            rows={2}
            placeholder="¿Por qué queda pendiente el otro canal?"
          />
        </div>
      )}

      <div className="space-y-2 rounded-lg border border-border/60 bg-background/40 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={labelCls}>Especialidades tratantes</p>
          {especialidades.length > 0 && (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${espMeta[espEstado].chip}`}
            >
              <span className={`h-2 w-2 rounded-full ${espMeta[espEstado].dot}`} />
              EVOLUCIÓN {espEstado}
            </span>
          )}
        </div>
        {especialidades.length === 0 ? (
          <p className="text-xs italic text-muted-foreground">
            No hay especialidades tratantes registradas para este caso. Puedes continuar con la
            observación manual.
          </p>
        ) : (
          <>
            <p className="text-[11px] text-muted-foreground">
              Marca las especialidades que ya fueron evolucionadas en este seguimiento.
            </p>
            <div className="space-y-1.5">
              {especialidades.map((esp) => (
                <label
                  key={esp}
                  className="flex items-center justify-between gap-2 rounded-md border border-border/50 px-2 py-1.5 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <Checkbox
                      checked={!!value.esp[esp]}
                      onCheckedChange={() =>
                        set({ esp: { ...value.esp, [esp]: !value.esp[esp] } })
                      }
                    />
                    {esp}
                  </span>
                  <span
                    className={`text-[10px] font-bold ${
                      value.esp[esp] ? "text-status-green" : "text-muted-foreground"
                    }`}
                  >
                    {value.esp[esp] ? "EVOLUCIONADA" : "PENDIENTE"}
                  </span>
                </label>
              ))}
            </div>
            {espEstado === "PARCIAL" && (
              <p className="text-[11px] text-status-amber">
                Pendiente: {derivado.pendientes.join(", ")}.
              </p>
            )}
          </>
        )}
      </div>

      <div className="space-y-1">
        <p className={labelCls}>Plantilla Índigo (automática)</p>
        <p className="whitespace-pre-line rounded-md border border-border bg-background p-2 text-[11px] text-muted-foreground">
          {derivado.plantilla}
        </p>
      </div>
    </div>
  );
}
