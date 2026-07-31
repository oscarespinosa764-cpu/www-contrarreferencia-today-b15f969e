// ---------------------------------------------------------------------------
// Bloque canónico "EVOLUCIÓN DIARIA" (FASE 5E · Bloque C.3).
//
// Fuente ÚNICA de cumplimiento: `resolverCumplimientoEvolucionDiaria`.
// Los canales YA NO se editan aquí: la única selección editable del canal es
// el campo superior CANAL DE GESTIÓN. Este cuadro solo muestra un resumen
// informativo (no editable) de los canales, el selector de funcionamiento de
// plataforma, las especialidades tratantes y UN solo badge de estado.
// ---------------------------------------------------------------------------
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
import { CANAL_CODES } from "@/lib/canal-gestion";
import {
  CANAL_LABEL_EVO,
  EVO_ESTADO_LABEL,
  EVO_ESTADO_META,
  INDIGO_EXCEPCION_CORREO,
  INDIGO_EXCEPCION_PLATAFORMA,
  estadoCanalEvolucion,
  resolverCumplimientoEvolucionDiaria,
  type CumplimientoEvolucion,
} from "@/lib/evolucion-diaria";
import {
  generarPlantillaEvolucionDiaria,
  generarPlantillaEvolucionEspecialidades,
} from "@/lib/indigo-trazabilidad";

export type EvolucionDiariaValue = {
  /** ¿La plataforma de la EAPB está funcionando? Solo si la EAPB usa plataforma. */
  plataformaFunc: "" | "SI" | "NO";
  motivoPend: string;
  /** Especialidades tratantes marcadas como evolucionadas. */
  esp: Record<string, boolean>;
};

export const EVOLUCION_DIARIA_INICIAL: EvolucionDiariaValue = {
  plataformaFunc: "",
  motivoPend: "",
  esp: {},
};

export type EvolucionDiariaContexto = {
  /** Catálogo EAPB activo: existe correo de radicación. */
  correoRequerido?: boolean;
  /** La EAPB del caso hace seguimientos en plataforma. */
  segEnPlataforma: boolean;
  /** Canales seleccionados en CANAL DE GESTIÓN (única fuente editable). */
  canalesRealizados: string[];
  especialidades?: string[];
  estadoCaso?: string | null;
  esTramiteAdministrativo?: boolean;
  /** Observación manual (usada en la plantilla por especialidades). */
  observacion?: string;
  /** Excepción canónica (solo módulos con tipo/motivo de remisión real). */
  esNuevaEps?: boolean;
  esRedNoContratada?: boolean;
  canalesPreviosCiclo?: string[];
  especialidadesPreviasCiclo?: string[];
};

export type EvolucionDiariaDerivado = {
  resolver: CumplimientoEvolucion;
  errores: string[];
  plantilla: string;
};

export function derivarEvolucionDiaria(
  v: EvolucionDiariaValue,
  ctx: EvolucionDiariaContexto,
): EvolucionDiariaDerivado {
  const especialidades = ctx.especialidades ?? [];
  const resolver = resolverCumplimientoEvolucionDiaria({
    correoRequerido: ctx.correoRequerido !== false,
    plataformaRequerida: ctx.segEnPlataforma === true,
    canalesRealizados: ctx.canalesRealizados ?? [],
    plataformaFuncionando:
      ctx.segEnPlataforma && v.plataformaFunc ? v.plataformaFunc === "SI" : null,
    especialidadesRequeridas: especialidades,
    especialidadesEvolucionadas: especialidades.filter((e) => v.esp[e]),
    esNuevaEps: ctx.esNuevaEps === true,
    esRedNoContratada: ctx.esRedNoContratada === true,
    canalesPreviosCiclo: ctx.canalesPreviosCiclo,
    especialidadesPreviasCiclo: ctx.especialidadesPreviasCiclo,
    motivoPendiente: v.motivoPend,
  });

  return {
    resolver,
    errores: resolver.errores,
    plantilla: plantillaEvolucionDesdeResolver(resolver, {
      especialidades,
      estadoCaso: ctx.estadoCaso ?? null,
      esTramiteAdministrativo: ctx.esTramiteAdministrativo === true,
      tienePlataforma: ctx.segEnPlataforma,
      observacion: ctx.observacion,
    }),
  };
}

/**
 * Generador único: la plantilla REPRESENTA el resolver, no recalcula estado.
 */
export function plantillaEvolucionDesdeResolver(
  r: CumplimientoEvolucion,
  ctx: {
    especialidades: string[];
    estadoCaso: string | null;
    esTramiteAdministrativo: boolean;
    tienePlataforma: boolean;
    observacion?: string;
  },
): string {
  if (r.variante_indigo === "EXCEPCION_PLATAFORMA") return INDIGO_EXCEPCION_PLATAFORMA;
  if (r.variante_indigo === "EXCEPCION_CORREO") return INDIGO_EXCEPCION_CORREO;

  const correo = r.canales_realizados.includes(CANAL_CODES.CORREO);
  const plataforma = r.canales_realizados.includes(CANAL_CODES.PLATAFORMA);

  if (ctx.especialidades.length > 0) {
    return generarPlantillaEvolucionEspecialidades({
      evolucionadas: r.especialidades_evolucionadas,
      pendientes: r.especialidades_pendientes,
      enviadoCorreo: correo,
      enviadoPlataforma: plataforma,
      observacion: ctx.observacion,
    });
  }
  return generarPlantillaEvolucionDiaria({
    estadoCaso: ctx.estadoCaso,
    esTramiteAdministrativo: ctx.esTramiteAdministrativo,
    tienePlataforma: ctx.tienePlataforma,
    plataformaFunciona: r.plataforma_funcionando,
    enviadoCorreo: correo,
    enviadoPlataforma: plataforma,
    motivoPendiente: r.motivo_pendiente ?? "",
  });
}

const labelCls = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

const canalEstadoCls: Record<string, string> = {
  REALIZADO: "text-status-green",
  EXENTO: "text-muted-foreground",
  PENDIENTE: "text-status-amber",
  "PENDIENTE POR FALLA": "text-status-amber",
};

/** Resumen informativo de canales (NO editable): refleja CANAL DE GESTIÓN. */
export function CanalesEvolucionResumen({ resolver }: { resolver: CumplimientoEvolucion }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-border/60 bg-background/40 p-3">
      <p className={labelCls}>Canales de evolución</p>
      <ul className="space-y-1">
        {resolver.canales_requeridos.map((c) => {
          const est = estadoCanalEvolucion(resolver, c);
          return (
            <li key={c} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2">
                <span aria-hidden="true">{est === "REALIZADO" ? "✓" : "○"}</span>
                {CANAL_LABEL_EVO[c] ?? c}
              </span>
              <span className={`text-[10px] font-bold ${canalEstadoCls[est] ?? ""}`}>{est}</span>
            </li>
          );
        })}
      </ul>
      <p className="text-[10px] text-muted-foreground">
        Los canales se seleccionan únicamente en CANAL DE GESTIÓN.
      </p>
    </div>
  );
}

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
  const r = derivado.resolver;
  const meta = EVO_ESTADO_META[r.estado];

  // Motivo libre solo cuando queda un canal pendiente que NO está documentado
  // por el selector de plataforma ni exento por la excepción autorizada.
  const requiereMotivo =
    r.canales_pendientes.length > 0 && !r.plataforma_pendiente_por_falla;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={labelCls}>Evolución diaria</p>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.chip}`}
        >
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
          {EVO_ESTADO_LABEL[r.estado]}
        </span>
      </div>

      {ctx.segEnPlataforma && (
        <div className="space-y-1.5">
          <Label className={labelCls} htmlFor="evo-plataforma-func">
            ¿Plataforma EAPB funcionando?
          </Label>
          <Select
            value={value.plataformaFunc}
            onValueChange={(v) => set({ plataformaFunc: v as "SI" | "NO" })}
          >
            <SelectTrigger id="evo-plataforma-func">
              <SelectValue placeholder="Seleccionar…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="SI">Sí</SelectItem>
              <SelectItem value="NO">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}

      <CanalesEvolucionResumen resolver={r} />

      {requiereMotivo && (
        <div className="space-y-1.5">
          <Label className={labelCls}>
            Motivo del pendiente (
            {r.canales_pendientes.map((c) => CANAL_LABEL_EVO[c] ?? c).join(", ")})
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
        <p className={labelCls}>Especialidades tratantes</p>
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
          </>
        )}
      </div>

      {(r.canales_pendientes.length > 0 || r.especialidades_pendientes.length > 0) && (
        <div className="space-y-0.5">
          <p className={labelCls}>Pendientes</p>
          <p className="text-[11px] text-status-amber">
            {[
              ...r.canales_pendientes.map((c) => CANAL_LABEL_EVO[c] ?? c),
              ...r.especialidades_pendientes,
            ].join(", ")}
            .
          </p>
        </div>
      )}

      <div className="space-y-1">
        <p className={labelCls}>Plantilla Índigo (automática)</p>
        <p className="whitespace-pre-line rounded-md border border-border bg-background p-2 text-[11px] text-muted-foreground">
          {derivado.plantilla}
        </p>
      </div>
    </div>
  );
}
