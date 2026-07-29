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
import { DictationTextarea } from "@/components/voz/dictation-textarea";
import { PARENTESCO_OPCIONES } from "@/lib/indigo-trazabilidad";
import { Lock } from "lucide-react";

export const CANALES_GESTION = [
  "TELEFÓNICO",
  "CORREO ELECTRÓNICO",
  "PLATAFORMA WEB",
  "FÍSICO / PRESENCIAL",
  "OTRO",
] as const;

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

export function CanalGestionField({
  value,
  onChange,
  otro,
  onOtroChange,
}: {
  value: string;
  onChange: (v: string) => void;
  otro: string;
  onOtroChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className={labelCls}>Canal de gestión *</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Seleccionar canal…" />
        </SelectTrigger>
        <SelectContent className="max-w-[calc(100vw-2rem)] scrollbar-invisible">
          {CANALES_GESTION.map((c) => (
            <SelectItem key={c} value={c} className="whitespace-normal [overflow-wrap:anywhere]">
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value === "OTRO" && (
        <Input
          placeholder="ESPECIFIQUE EL CANAL"
          value={otro}
          onChange={(e) => onOtroChange(e.target.value.toUpperCase())}
        />
      )}
    </div>
  );
}

export function canalFinalDe(canal: string, canalOtro: string): string {
  return canal === "OTRO" ? canalOtro.trim().toUpperCase() : canal;
}

// --- Información del trámite -------------------------------------------------

export type InformacionTramiteValue = {
  solicitante: string;
  parentesco: string;
  telefono: string;
  observacion: string;
};

export const INFORMACION_TRAMITE_INICIAL: InformacionTramiteValue = {
  solicitante: "",
  parentesco: "",
  telefono: "",
  observacion: "",
};

export function erroresInformacionTramite(v: InformacionTramiteValue): string[] {
  const e: string[] = [];
  if (!v.solicitante.trim()) e.push("Indica el nombre de quien solicita la información.");
  if (!v.parentesco) e.push("Indica el parentesco / relación de quien solicita.");
  if (!v.observacion.trim()) e.push("Describe la información brindada del trámite.");
  return e;
}

export function plantillaInformacionTramite(v: InformacionTramiteValue, canal?: string): string {
  const quien = v.solicitante.trim().toUpperCase() || "[SOLICITANTE]";
  const par = v.parentesco || "[PARENTESCO]";
  const tel = v.telefono.trim() ? ` TELÉFONO DE CONTACTO: ${v.telefono.trim()}.` : "";
  const via = canal ? ` POR CANAL ${canal}` : "";
  return `SE BRINDA INFORMACIÓN DEL TRÁMITE${via} A ${quien}, EN CALIDAD DE ${par}.${tel} INFORMACIÓN SUMINISTRADA: ${
    v.observacion.trim().toUpperCase() || "[DETALLE]"
  } NO SE MODIFICA EL ESTADO DEL CASO; SE DEJA TRAZABILIDAD DE LA ATENCIÓN BRINDADA.`;
}

export function InformacionTramiteFields({
  value,
  onChange,
  dictationKey = "seguimiento.informacion_tramite",
}: {
  value: InformacionTramiteValue;
  onChange: (v: InformacionTramiteValue) => void;
  dictationKey?: string;
}) {
  const set = (patch: Partial<InformacionTramiteValue>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
      <p className={labelCls}>Información del trámite</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className={labelCls}>Nombre de quien solicita *</Label>
          <Input
            value={value.solicitante}
            onChange={(e) => set({ solicitante: e.target.value.toUpperCase() })}
            placeholder="Nombre y apellido"
          />
        </div>
        <div className="space-y-1.5">
          <Label className={labelCls}>Parentesco / relación *</Label>
          <Select value={value.parentesco} onValueChange={(v) => set({ parentesco: v })}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Seleccionar…" />
            </SelectTrigger>
            <SelectContent className="max-w-[calc(100vw-2rem)] scrollbar-invisible">
              {PARENTESCO_OPCIONES.map((p) => (
                <SelectItem
                  key={p}
                  value={p}
                  className="whitespace-normal [overflow-wrap:anywhere]"
                >
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label className={labelCls}>Teléfono de contacto</Label>
          <Input
            value={value.telefono}
            onChange={(e) => set({ telefono: e.target.value })}
            placeholder="Opcional"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label className={labelCls}>Información brindada *</Label>
        <DictationTextarea
          dictationKey={dictationKey}
          value={value.observacion}
          onChange={(e) => set({ observacion: e.target.value })}
          rows={3}
          placeholder="Describe la información entregada sobre el trámite"
        />
      </div>
      <p className="text-[10px] text-muted-foreground">
        Este seguimiento es informativo: no modifica el estado del caso.
      </p>
    </div>
  );
}
