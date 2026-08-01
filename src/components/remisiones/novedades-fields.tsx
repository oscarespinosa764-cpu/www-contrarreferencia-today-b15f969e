// ---------------------------------------------------------------------------
// FASE 5K · BLOQUE C — Componente canónico de NOVEDADES.
//
// Fuente ÚNICA de los subtipos de novedad y de los formularios de CAMBIO
// MOTIVO DE REMISIÓN y GESTIÓN DE MODALIDAD. No autoriza ni persiste: el
// servidor (RPC transaccional) es la única autoridad. Los formularios de
// CAMBIO DE UNIDAD y CAMBIO EN ESPECIALIDAD se conservan tal cual en cada
// modal y solo cambian de ubicación (ahora viven dentro de NOVEDADES).
// ---------------------------------------------------------------------------
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MOTIVOS_REMISION } from "@/lib/motivos-remision";
import { SERVICIO_LABEL, SERVICIOS_CODIGOS, type ServicioCodigo } from "@/lib/phd-requisitos";

/** Subtipos estructurados de NOVEDADES. "" = novedad operativa existente. */
export type NovedadSubtipo =
  | ""
  | "CAMBIO_UNIDAD"
  | "CAMBIO_ESPECIALIDAD"
  | "CAMBIO_MOTIVO_REMISION"
  | "GESTION_MODALIDAD";

export type ModuloNovedad = "REMISIONES" | "REFERENCIA_INTERNA" | "DOMICILIARIA";

const OPCIONES: Record<ModuloNovedad, { valor: NovedadSubtipo; label: string }[]> = {
  REMISIONES: [
    { valor: "", label: "NOVEDAD OPERATIVA DEL TRÁMITE" },
    { valor: "CAMBIO_UNIDAD", label: "CAMBIO DE UNIDAD" },
    { valor: "CAMBIO_ESPECIALIDAD", label: "CAMBIO DE ESPECIALIDAD" },
    { valor: "CAMBIO_MOTIVO_REMISION", label: "CAMBIO MOTIVO DE REMISIÓN" },
  ],
  REFERENCIA_INTERNA: [
    { valor: "", label: "NOVEDAD INTERNA / EXTERNA" },
    { valor: "CAMBIO_UNIDAD", label: "CAMBIO DE UNIDAD" },
  ],
  DOMICILIARIA: [
    { valor: "", label: "NOVEDAD OPERATIVA DEL TRÁMITE" },
    { valor: "CAMBIO_UNIDAD", label: "CAMBIO DE UNIDAD" },
    { valor: "GESTION_MODALIDAD", label: "GESTIÓN DE MODALIDAD" },
  ],
};

const SENTINEL = "__BASE__";

export function NovedadSubtipoSelector({
  modulo,
  value,
  onChange,
  disabled,
}: {
  modulo: ModuloNovedad;
  value: NovedadSubtipo;
  onChange: (v: NovedadSubtipo) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>TIPO DE NOVEDAD *</Label>
      <Select
        value={value === "" ? SENTINEL : value}
        onValueChange={(v) => onChange((v === SENTINEL ? "" : v) as NovedadSubtipo)}
        disabled={disabled}
      >
        <SelectTrigger>
          <SelectValue placeholder="Selecciona el tipo de novedad" />
        </SelectTrigger>
        <SelectContent>
          {OPCIONES[modulo].map((o) => (
            <SelectItem key={o.valor || SENTINEL} value={o.valor || SENTINEL}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        Toda novedad conserva el caso y su trazabilidad: no reinicia el flujo ni crea un caso nuevo.
      </p>
    </div>
  );
}

// --- CAMBIO MOTIVO DE REMISIÓN ---------------------------------------------

export type CambioMotivoValue = { nuevoMotivo: string; justificacion: string };
export const CAMBIO_MOTIVO_INICIAL: CambioMotivoValue = { nuevoMotivo: "", justificacion: "" };

export function CambioMotivoFields({
  motivoActual,
  value,
  onChange,
}: {
  motivoActual: string;
  value: CambioMotivoValue;
  onChange: (v: CambioMotivoValue) => void;
}) {
  const actualNorm = (motivoActual ?? "").trim().toUpperCase();
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="text-xs text-muted-foreground">
        MOTIVO ACTUAL: <span className="font-medium">{actualNorm || "NO REGISTRADO"}</span>
      </div>
      <div className="space-y-1.5">
        <Label>NUEVO MOTIVO DE REMISIÓN *</Label>
        <Select
          value={value.nuevoMotivo}
          onValueChange={(v) => onChange({ ...value, nuevoMotivo: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecciona el nuevo motivo" />
          </SelectTrigger>
          <SelectContent>
            {MOTIVOS_REMISION.filter((m) => m !== actualNorm).map((m) => (
              <SelectItem key={m} value={m}>
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>JUSTIFICACIÓN DEL CAMBIO *</Label>
        <Textarea
          value={value.justificacion}
          maxLength={1000}
          onChange={(e) => onChange({ ...value, justificacion: e.target.value })}
          placeholder="Explique por qué cambia el motivo de remisión…"
        />
      </div>
    </div>
  );
}

// --- GESTIÓN DE MODALIDAD (Atención Domiciliaria) --------------------------

export type GestionModalidadValue = {
  gestion: "" | "AGREGAR_MODALIDAD" | "CAMBIAR_MODALIDAD";
  origen: string;
  nueva: string;
  justificacion: string;
};
export const GESTION_MODALIDAD_INICIAL: GestionModalidadValue = {
  gestion: "",
  origen: "",
  nueva: "",
  justificacion: "",
};

export function GestionModalidadFields({
  modalidadesActivas,
  value,
  onChange,
  bloqueoAmbulancia,
}: {
  modalidadesActivas: string[];
  value: GestionModalidadValue;
  onChange: (v: GestionModalidadValue) => void;
  bloqueoAmbulancia?: boolean;
}) {
  const activas = modalidadesActivas.filter((m) =>
    (SERVICIOS_CODIGOS as readonly string[]).includes(m),
  ) as ServicioCodigo[];
  const disponibles = (SERVICIOS_CODIGOS as readonly ServicioCodigo[]).filter(
    (c) => !activas.includes(c),
  );
  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="text-xs text-muted-foreground">
        MODALIDADES ACTIVAS:{" "}
        <span className="font-medium">
          {activas.map((a) => SERVICIO_LABEL[a]).join(", ") || "NINGUNA"}
        </span>
      </div>
      <div className="space-y-1.5">
        <Label>TIPO DE GESTIÓN *</Label>
        <Select
          value={value.gestion}
          onValueChange={(v) =>
            onChange({ ...value, gestion: v as GestionModalidadValue["gestion"], origen: "" })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Selecciona la gestión" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="AGREGAR_MODALIDAD">AGREGAR MODALIDAD</SelectItem>
            <SelectItem value="CAMBIAR_MODALIDAD">CAMBIAR MODALIDAD</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {value.gestion === "CAMBIAR_MODALIDAD" && (
        <div className="space-y-1.5">
          <Label>MODALIDAD DE ORIGEN *</Label>
          <Select value={value.origen} onValueChange={(v) => onChange({ ...value, origen: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Modalidad que se reemplaza" />
            </SelectTrigger>
            <SelectContent>
              {activas.map((a) => (
                <SelectItem key={a} value={a}>
                  {SERVICIO_LABEL[a]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {value.origen === "AMBULANCIA_EGRESO" && bloqueoAmbulancia && (
            <p className="text-xs text-destructive">
              La modalidad AMBULANCIA tiene evidencia registrada o una firma QR vigente. Revoque o
              cierre ese flujo antes de cambiarla.
            </p>
          )}
        </div>
      )}
      {value.gestion !== "" && (
        <div className="space-y-1.5">
          <Label>NUEVA MODALIDAD *</Label>
          <Select value={value.nueva} onValueChange={(v) => onChange({ ...value, nueva: v })}>
            <SelectTrigger>
              <SelectValue placeholder="Selecciona la nueva modalidad" />
            </SelectTrigger>
            <SelectContent>
              {disponibles.map((c) => (
                <SelectItem key={c} value={c}>
                  {SERVICIO_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>JUSTIFICACIÓN *</Label>
        <Textarea
          value={value.justificacion}
          maxLength={1000}
          onChange={(e) => onChange({ ...value, justificacion: e.target.value })}
          placeholder="Explique la gestión de modalidad…"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        La gestión de modalidad NO cambia la ubicación del paciente. Los requisitos del ciclo se
        recalculan en el servidor con las modalidades resultantes.
      </p>
    </div>
  );
}
