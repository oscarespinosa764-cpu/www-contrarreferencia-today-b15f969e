// ---------------------------------------------------------------------------
// FASE 5E · Bloque C — Componente CANÓNICO del CANAL DE GESTIÓN.
// Consumido por Remisiones, Atención Domiciliaria, Referencias Internas y
// Pendientes. No existe ninguna variante por módulo ni por rol: la
// disponibilidad depende de los permisos ya vigentes del flujo que lo monta.
// ---------------------------------------------------------------------------
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  ACERCAMIENTO_CON,
  CANALES_GESTION_CATALOGO,
  CANAL_CODES,
  CANAL_OTRO_MAX,
  CONTACTO_TIPOS,
  CONTACTO_TIPO_LABEL,
  COMUNICACION_CON,
  MAX_CONTACTOS,
  MSG_MAX_CONTACTOS,
  SERVICIOS_PRESENCIAL,
  cargosDe,
  type CanalGestionValue,
  type ContactoDetalle,
  type ContactoTipo,
} from "@/lib/canal-gestion";

const labelCls = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

function Campo({
  id,
  label,
  value,
  onChange,
  placeholder,
  max = 200,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  max?: number;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={labelCls}>
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
      />
    </div>
  );
}

function Selector({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className={labelCls}>
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue placeholder="Seleccionar…" />
        </SelectTrigger>
        <SelectContent className="max-w-[calc(100vw-2rem)] scrollbar-invisible">
          {options.map((o) => (
            <SelectItem key={o} value={o} className="whitespace-normal [overflow-wrap:anywhere]">
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function BloqueContacto({
  tipo,
  value,
  onChange,
}: {
  tipo: ContactoTipo;
  value: ContactoDetalle;
  onChange: (v: ContactoDetalle) => void;
}) {
  const pre = tipo.toLowerCase();
  const set = (patch: Partial<ContactoDetalle>) => onChange({ ...value, ...patch });
  return (
    <fieldset className="space-y-3 rounded-lg border border-border/60 bg-background/40 p-3">
      <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-foreground">
        {CONTACTO_TIPO_LABEL[tipo]}
      </legend>

      {tipo === "FAMILIAR_PACIENTE" ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Selector
            id={`${pre}_comunicacion`}
            label="Comunicación con *"
            value={value.comunicacion ?? ""}
            onChange={(v) =>
              set({ comunicacion: v, comunicacionOtro: v === "OTRO" ? value.comunicacionOtro : "" })
            }
            options={COMUNICACION_CON}
          />
          {value.comunicacion === "OTRO" && (
            <Campo
              id={`${pre}_comunicacion_otro`}
              label="¿Cuál? *"
              value={value.comunicacionOtro ?? ""}
              onChange={(v) => set({ comunicacionOtro: v })}
            />
          )}
          <Campo
            id={`${pre}_nombre`}
            label="Nombre y apellido *"
            value={value.nombre ?? ""}
            onChange={(v) => set({ nombre: v })}
          />
          {value.comunicacion !== "PACIENTE" && (
            <Campo
              id={`${pre}_parentesco`}
              label={value.comunicacion ? "Parentesco *" : "Parentesco"}
              value={value.parentesco ?? ""}
              onChange={(v) => set({ parentesco: v })}
            />
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {tipo === "IPS" && (
            <Campo
              id={`${pre}_nombre_ips`}
              label="Nombre de IPS *"
              value={value.nombreIps ?? ""}
              onChange={(v) => set({ nombreIps: v })}
            />
          )}
          <Campo
            id={`${pre}_nombre`}
            label="Nombre y apellido *"
            value={value.nombre ?? ""}
            onChange={(v) => set({ nombre: v })}
          />
          <Selector
            id={`${pre}_cargo`}
            label="Cargo *"
            value={value.cargo ?? ""}
            onChange={(v) => set({ cargo: v, cargoOtro: v === "OTRO" ? value.cargoOtro : "" })}
            options={cargosDe(tipo)}
          />
          {value.cargo === "OTRO" && (
            <Campo
              id={`${pre}_cargo_otro`}
              label="¿Cuál? *"
              value={value.cargoOtro ?? ""}
              onChange={(v) => set({ cargoOtro: v })}
            />
          )}
          <Campo
            id={`${pre}_telefono`}
            label="Teléfono *"
            value={value.telefono ?? ""}
            onChange={(v) => set({ telefono: v })}
            max={40}
          />
        </div>
      )}
    </fieldset>
  );
}

export function CanalGestionField({
  value,
  onChange,
  dualPermitido = false,
  motivoNoDual = null,
  observacionesSlot,
}: {
  value: CanalGestionValue;
  onChange: (v: CanalGestionValue) => void;
  /** EVOLUCIÓN DIARIA + EAPB con correo y plataforma habilitados en catálogo. */
  dualPermitido?: boolean;
  /** Motivo informativo cuando el dual no aplica en Evolución Diaria. */
  motivoNoDual?: string | null;
  observacionesSlot?: React.ReactNode;
}) {

  const set = (patch: Partial<CanalGestionValue>) => onChange({ ...value, ...patch });
  const activo = (c: string) => value.canales.includes(c);

  const toggleCanal = (codigo: string) => {
    const dualPair = codigo === CANAL_CODES.CORREO || codigo === CANAL_CODES.PLATAFORMA;
    if (activo(codigo)) {
      // Solo puede deseleccionarse cuando queda otro canal (dual).
      if (value.canales.length > 1) set({ canales: value.canales.filter((c) => c !== codigo) });
      return;
    }
    if (dualPermitido && dualPair && value.canales.length === 1) {
      const otro = value.canales[0];
      if (otro === CANAL_CODES.CORREO || otro === CANAL_CODES.PLATAFORMA) {
        set({ canales: [...value.canales, codigo] });
        return;
      }
    }
    // Selección única: reemplaza y limpia detalles del canal anterior.
    set({
      canales: [codigo],
      otroCual: codigo === CANAL_CODES.OTRO ? value.otroCual : "",
      contactos: codigo === CANAL_CODES.TELEFONO ? value.contactos : [],
      detalleContactos: codigo === CANAL_CODES.TELEFONO ? value.detalleContactos : {},
      presencial:
        codigo === CANAL_CODES.PRESENCIAL
          ? value.presencial
          : {
              acercamiento: "",
              nombre: "",
              parentesco: "",
              conQuien: "",
              servicio: "",
              servicioOtro: "",
              funcionario: "",
              cargoFuncionario: "",
            },
    });
  };

  const toggleContacto = (tipo: ContactoTipo) => {
    if (value.contactos.includes(tipo)) {
      set({ contactos: value.contactos.filter((t) => t !== tipo) });
      return;
    }
    if (value.contactos.length >= MAX_CONTACTOS) {
      toast.error(MSG_MAX_CONTACTOS);
      return;
    }
    set({ contactos: [...value.contactos, tipo] });
  };

  const p = value.presencial;
  const setP = (patch: Partial<typeof p>) => set({ presencial: { ...p, ...patch } });

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className={labelCls}>Canal de gestión *</Label>
        <div role="group" aria-label="Canal de gestión" className="flex flex-wrap gap-1.5">
          {CANALES_GESTION_CATALOGO.map((c) => (
            <button
              key={c.codigo}
              type="button"
              aria-pressed={activo(c.codigo)}
              onClick={() => toggleCanal(c.codigo)}
              className={`min-h-9 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                activo(c.codigo)
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-muted/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        {dualPermitido ? (
          <p className="text-[10px] text-muted-foreground">
            Evolución diaria: esta EAPB permite seleccionar CORREO ELECTRÓNICO y PLATAFORMA WEB
            simultáneamente.
          </p>
        ) : motivoNoDual ? (
          <p className="text-[10px] text-muted-foreground">{motivoNoDual}</p>
        ) : null}

      </div>

      {activo(CANAL_CODES.OTRO) && (
        <Campo
          id="canal_otro_cual"
          label="¿Cuál es el canal de gestión? *"
          value={value.otroCual}
          onChange={(v) => set({ otroCual: v })}
          max={CANAL_OTRO_MAX}
        />
      )}

      {activo(CANAL_CODES.TELEFONO) && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
          <p className={labelCls}>Contacto realizado con *</p>
          <div
            role="group"
            aria-label="Contacto realizado con"
            aria-describedby="contactos_max"
            className="flex flex-wrap gap-1.5"
          >
            {CONTACTO_TIPOS.map((t) => (
              <button
                key={t}
                type="button"
                aria-pressed={value.contactos.includes(t)}
                onClick={() => toggleContacto(t)}
                className={`min-h-9 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors ${
                  value.contactos.includes(t)
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background/60 text-muted-foreground hover:text-foreground"
                }`}
              >
                {CONTACTO_TIPO_LABEL[t]}
              </button>
            ))}
          </div>
          <p id="contactos_max" className="text-[10px] text-muted-foreground">
            {MSG_MAX_CONTACTOS}
          </p>
          <div className="grid grid-cols-1 gap-3">
            {CONTACTO_TIPOS.filter((t) => value.contactos.includes(t)).map((t) => (
              <BloqueContacto
                key={t}
                tipo={t}
                value={value.detalleContactos[t] ?? {}}
                onChange={(d) => set({ detalleContactos: { ...value.detalleContactos, [t]: d } })}
              />
            ))}
          </div>
        </div>
      )}

      {activo(CANAL_CODES.PRESENCIAL) && (
        <fieldset className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
          <legend className="px-1 text-[11px] font-bold uppercase tracking-wide text-foreground">
            Presencial
          </legend>
          <Selector
            id="presencial_acercamiento"
            label="Acercamiento con *"
            value={p.acercamiento}
            onChange={(v) =>
              setP({
                acercamiento: v,
                nombre: v === "FAMILIAR" || v === "OTRO" ? p.nombre : "",
                parentesco: v === "FAMILIAR" ? p.parentesco : "",
                conQuien: v === "OTRO" ? p.conQuien : "",
                servicio: v === "SERVICIO" ? p.servicio : "",
                servicioOtro: v === "SERVICIO" ? p.servicioOtro : "",
                funcionario: v === "SERVICIO" ? p.funcionario : "",
                cargoFuncionario: v === "SERVICIO" ? p.cargoFuncionario : "",
              })
            }
            options={ACERCAMIENTO_CON}
          />
          {p.acercamiento === "FAMILIAR" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Campo
                id="presencial_nombre"
                label="Nombre y apellido *"
                value={p.nombre}
                onChange={(v) => setP({ nombre: v })}
              />
              <Campo
                id="presencial_parentesco"
                label="Parentesco *"
                value={p.parentesco}
                onChange={(v) => setP({ parentesco: v })}
              />
            </div>
          )}
          {p.acercamiento === "PACIENTE" && (
            <p className="text-[10px] text-muted-foreground">
              El acercamiento se registra con el paciente del caso. No se solicitan datos
              adicionales.
            </p>
          )}
          {p.acercamiento === "SERVICIO" && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Selector
                id="presencial_servicio"
                label="Servicio *"
                value={p.servicio}
                onChange={(v) =>
                  setP({ servicio: v, servicioOtro: v === "OTRO" ? p.servicioOtro : "" })
                }
                options={SERVICIOS_PRESENCIAL}
              />
              {p.servicio === "OTRO" && (
                <Campo
                  id="presencial_servicio_otro"
                  label="¿Cuál? *"
                  value={p.servicioOtro}
                  onChange={(v) => setP({ servicioOtro: v })}
                />
              )}
              <Campo
                id="presencial_funcionario"
                label="Nombre del funcionario *"
                value={p.funcionario}
                onChange={(v) => setP({ funcionario: v })}
              />
              <Campo
                id="presencial_cargo_funcionario"
                label="Cargo del funcionario *"
                value={p.cargoFuncionario}
                onChange={(v) => setP({ cargoFuncionario: v })}
              />
            </div>
          )}
          {p.acercamiento === "OTRO" && (
            <div className="grid grid-cols-1 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="presencial_con_quien" className={labelCls}>
                  ¿Con quién se realizó el acercamiento? *
                </Label>
                <Textarea
                  id="presencial_con_quien"
                  rows={2}
                  maxLength={200}
                  value={p.conQuien}
                  onChange={(e) => setP({ conQuien: e.target.value.toUpperCase() })}
                />
              </div>
              <Campo
                id="presencial_otro_nombre"
                label="Nombre y apellido *"
                value={p.nombre}
                onChange={(v) => setP({ nombre: v })}
              />
            </div>
          )}
        </fieldset>
      )}

      {observacionesSlot}
    </div>
  );
}
