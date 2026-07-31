// ---------------------------------------------------------------------------
// FASE 5E · Bloque A — Piezas visuales compartidas de los modales de
// seguimiento (REMISIONES, REFERENCIAS INTERNAS, PHD/PAD/O2/ESPECIALES y
// PENDIENTES).
//
// Contiene:
// - SeguimientoHeaderCard: tarjeta superior unificada (paciente + estado).
// - CanalGestionField: selector canónico de CANAL DE GESTIÓN (global).
// - InformacionTramiteFields: bloque "Información del trámite" (no aplica a
//   PENDIENTES) con su plantilla canónica.
// ---------------------------------------------------------------------------
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Lock } from "lucide-react";
import { CANALES_GESTION_LABELS, CANAL_OTRO_MAX } from "@/lib/canal-gestion";

// Allowlist ÚNICA compartida con el servidor (src/lib/canal-gestion.ts).
export const CANALES_GESTION = CANALES_GESTION_LABELS;

const labelCls = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export function SeguimientoHeaderCard({
  paciente,
  documento,
  tipoDocumento,
  estado,
  contexto,
  nota,
}: {
  paciente: string;
  documento?: string | null;
  tipoDocumento?: string | null;
  estado?: string | null;
  contexto?: string | null;
  nota?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold uppercase text-foreground">
            {paciente || "—"}
          </p>
          <p className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
            {tipoDocumento ? `${tipoDocumento} ` : ""}
            {documento || "—"}
            {contexto ? ` · ${contexto}` : ""}
          </p>
        </div>
        {estado ? (
          <Badge variant="default" className="shrink-0 font-semibold">
            <Lock className="mr-1 h-3 w-3" /> {estado}
          </Badge>
        ) : null}
      </div>
      {nota ? (
        <p className="mt-1 text-[10.5px] uppercase tracking-wide text-muted-foreground">{nota}</p>
      ) : null}
    </div>
  );
}

// FASE 5E · Bloque C — el selector canónico vive en su propio módulo y es
// compartido por los cuatro módulos de seguimiento.
export { CanalGestionField } from "@/components/remisiones/canal-gestion-field";

// --- Información del trámite -------------------------------------------------
// FASE 5E · Bloque A.1 — Formulario canónico: SOLO nombre y parentesco del
// solicitante. Las observaciones se registran en la casilla general del modal
// (no se crea una segunda casilla). Los campos TELÉFONO e INFORMACIÓN BRINDADA
// quedan retirados para registros nuevos; los históricos se conservan intactos.

export type InformacionTramiteValue = {
  solicitante: string;
  parentesco: string;
};

export const INFORMACION_TRAMITE_INICIAL: InformacionTramiteValue = {
  solicitante: "",
  parentesco: "",
};

export const INFO_TRAMITE_MIN = 3;
export const INFO_TRAMITE_MAX_NOMBRE = 120;
export const INFO_TRAMITE_MAX_PARENTESCO = 80;

export function erroresInformacionTramite(v: InformacionTramiteValue): string[] {
  const e: string[] = [];
  const nombre = v.solicitante.trim();
  const par = v.parentesco.trim();
  if (nombre.length < INFO_TRAMITE_MIN)
    e.push("Indica el nombre y apellido del solicitante.");
  if (nombre.length > INFO_TRAMITE_MAX_NOMBRE)
    e.push("El nombre del solicitante es demasiado largo.");
  if (par.length < INFO_TRAMITE_MIN) e.push("Indica el parentesco del solicitante.");
  if (par.length > INFO_TRAMITE_MAX_PARENTESCO)
    e.push("El parentesco del solicitante es demasiado largo.");
  return e;
}

export function plantillaInformacionTramite(
  v: InformacionTramiteValue,
  canal?: string,
  observaciones?: string,
): string {
  const lineas = [
    "INFORMACIÓN DEL TRÁMITE.",
    `NOMBRE Y APELLIDO DEL SOLICITANTE: ${v.solicitante.trim().toUpperCase()}`,
    `PARENTESCO DEL SOLICITANTE: ${v.parentesco.trim().toUpperCase()}`,
  ];
  if (canal && canal.trim()) lineas.push(`CANAL DE GESTIÓN: ${canal.trim().toUpperCase()}`);
  if (observaciones && observaciones.trim())
    lineas.push(`OBSERVACIONES: ${observaciones.trim().toUpperCase()}`);
  return lineas.join("\n");
}

export function InformacionTramiteFields({
  value,
  onChange,
}: {
  value: InformacionTramiteValue;
  onChange: (v: InformacionTramiteValue) => void;
}) {
  const set = (patch: Partial<InformacionTramiteValue>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
      <p className={labelCls}>Información del trámite</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className={labelCls}>Nombre y apellido del solicitante *</Label>
          <Input
            value={value.solicitante}
            maxLength={INFO_TRAMITE_MAX_NOMBRE}
            onChange={(e) => set({ solicitante: e.target.value.toUpperCase() })}
            placeholder="Nombre y apellido"
          />
        </div>
        <div className="space-y-1.5">
          <Label className={labelCls}>Parentesco del solicitante *</Label>
          <Input
            value={value.parentesco}
            maxLength={INFO_TRAMITE_MAX_PARENTESCO}
            onChange={(e) => set({ parentesco: e.target.value.toUpperCase() })}
            placeholder="MADRE, HIJO, ACUDIENTE…"
          />
        </div>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Registra la información entregada en la casilla general de observaciones. Este
        seguimiento es informativo: no modifica el estado del caso.
      </p>
    </div>
  );
}

