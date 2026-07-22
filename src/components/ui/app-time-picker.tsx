/**
 * AppTimePicker · reloj analógico 24h + wrapper de fecha y hora.
 *
 * — Reutiliza `Calendar` (shadcn) sin cambios.
 * — Corrige el reloj (fondo blanco, números negros, siempre visibles,
 *   anillo exterior 1-12 y anillo interior 13-23 + 00).
 * — `AppDateTimeInput` ahora se comporta como UN SOLO recuadro: al
 *   pulsarlo abre un panel único con calendario y reloj (lado a lado
 *   en escritorio, apilados en móvil).
 * — El valor se expone en un `<input hidden name=...>` con formato
 *   `YYYY-MM-DDTHH:mm` para preservar la compatibilidad con `FormData`.
 */
import { useEffect, useMemo, useState } from "react";
import { CalendarIcon } from "lucide-react";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const pad2 = (n: number) => String(n).padStart(2, "0");
const MINUTOS_MARCAS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

// ---------------------------------------------------------------------------
// AnalogClock24 · SVG puro, fondo blanco, números negros, 24 horas visibles.
// Anillo exterior: 1..12  ·  Anillo interior: 13..23 + 00.
// ---------------------------------------------------------------------------
interface AnalogClock24Props {
  step: "h" | "m";
  hour: number;
  minute: number;
  onSelectHour: (h: number) => void;
  onSelectMinute: (m: number) => void;
}

function AnalogClock24({ step, hour, minute, onSelectHour, onSelectMinute }: AnalogClock24Props) {
  // Geometría
  const CX = 140,
    CY = 140,
    R_FACE = 128,
    R_OUT = 112,
    R_IN = 74;

  const posHour = (h: number) => {
    // Exterior 1..12, Interior 13..23 y 00
    const outer = h >= 1 && h <= 12;
    const r = outer ? R_OUT : R_IN;
    const angleDeg = (h % 12) * 30 - 90; // 12/00 arriba
    const rad = (angleDeg * Math.PI) / 180;
    return { x: CX + r * Math.cos(rad), y: CY + r * Math.sin(rad) };
  };

  const posMin = (m: number) => {
    const angleDeg = (m / 60) * 360 - 90;
    const rad = (angleDeg * Math.PI) / 180;
    return { x: CX + R_OUT * Math.cos(rad), y: CY + R_OUT * Math.sin(rad) };
  };

  const horas = Array.from({ length: 24 }, (_, i) => i); // 0..23
  const selP = step === "h" ? posHour(hour) : posMin(minute);

  // Colores fijos, no dependen de tokens de tema (para evitar esferas negras).
  const FACE = "#ffffff";
  const BORDER = "#d1d5db"; // gris claro
  const NUM = "#111827"; // negro casi puro
  const ACCENT = "#0B3C73"; // azul institucional
  const NUM_INNER = "#374151"; // gris oscuro para diferenciar el anillo interior

  return (
    <svg
      width={280}
      height={280}
      viewBox="0 0 280 280"
      role="group"
      aria-label={step === "h" ? "Reloj de horas (24h)" : "Reloj de minutos"}
      style={{ background: "transparent" }}
    >
      {/* Esfera blanca con borde gris claro */}
      <circle cx={CX} cy={CY} r={R_FACE} fill={FACE} stroke={BORDER} strokeWidth={1} />
      {/* Aguja desde el centro al valor seleccionado */}
      <line x1={CX} y1={CY} x2={selP.x} y2={selP.y} stroke={ACCENT} strokeWidth={2} />
      {/* Botón del punto seleccionado */}
      <circle cx={selP.x} cy={selP.y} r={16} fill={ACCENT} />
      {/* Punto central */}
      <circle cx={CX} cy={CY} r={3.5} fill={ACCENT} />

      {step === "h"
        ? horas.map((h) => {
            const p = posHour(h);
            const sel = h === hour;
            const outer = h >= 1 && h <= 12;
            return (
              <g
                key={h}
                onClick={() => onSelectHour(h)}
                className="cursor-pointer"
                role="button"
                aria-label={`Hora ${pad2(h)}`}
              >
                {/* Área de toque generosa */}
                <circle cx={p.x} cy={p.y} r={15} fill="transparent" />
                <text
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={outer ? 14 : 12}
                  fontWeight={sel ? 700 : 600}
                  fontFamily="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
                  fill={sel ? "#ffffff" : outer ? NUM : NUM_INNER}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {pad2(h)}
                </text>
              </g>
            );
          })
        : MINUTOS_MARCAS.map((m) => {
            const p = posMin(m);
            const sel = m === minute;
            return (
              <g
                key={m}
                onClick={() => onSelectMinute(m)}
                className="cursor-pointer"
                role="button"
                aria-label={`Minuto ${pad2(m)}`}
              >
                <circle cx={p.x} cy={p.y} r={16} fill="transparent" />
                <text
                  x={p.x}
                  y={p.y}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={14}
                  fontWeight={sel ? 700 : 600}
                  fontFamily="system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
                  fill={sel ? "#ffffff" : NUM}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {pad2(m)}
                </text>
              </g>
            );
          })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// ClockPanel · Cabecera HH:mm + reloj + campo de minuto exacto.
// ---------------------------------------------------------------------------
interface ClockPanelProps {
  hour: number;
  minute: number;
  step: "h" | "m";
  onStep: (s: "h" | "m") => void;
  onHour: (h: number) => void;
  onMinute: (m: number) => void;
}

function ClockPanel({ hour, minute, step, onStep, onHour, onMinute }: ClockPanelProps) {
  const [minutoManual, setMinutoManual] = useState<string>(pad2(minute));
  useEffect(() => {
    setMinutoManual(pad2(minute));
  }, [minute]);

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="flex items-center justify-center gap-1 rounded-md bg-primary/10 px-2 py-2 text-3xl font-bold tabular-nums">
        <button
          type="button"
          onClick={() => onStep("h")}
          className={cn(
            "rounded-md px-3 py-1 transition",
            step === "h" ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-primary/20",
          )}
          aria-label="Editar hora"
        >
          {pad2(hour)}
        </button>
        <span className="opacity-70">:</span>
        <button
          type="button"
          onClick={() => onStep("m")}
          className={cn(
            "rounded-md px-3 py-1 transition",
            step === "m" ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-primary/20",
          )}
          aria-label="Editar minutos"
        >
          {pad2(minute)}
        </button>
      </div>

      <div className="rounded-full bg-white p-1">
        <AnalogClock24
          step={step}
          hour={hour}
          minute={minute}
          onSelectHour={(h) => {
            onHour(h);
            // Paso automático a minutos tras un breve retraso
            window.setTimeout(() => onStep("m"), 180);
          }}
          onSelectMinute={(m) => {
            onMinute(m);
            setMinutoManual(pad2(m));
          }}
        />
      </div>

      {step === "m" && (
        <div className="flex items-center justify-center gap-2">
          <Label className="text-xs uppercase text-muted-foreground">Minuto exacto</Label>
          <Input
            type="number"
            min={0}
            max={59}
            value={minutoManual}
            onChange={(e) => {
              const raw = e.target.value.replace(/\D/g, "").slice(0, 2);
              setMinutoManual(raw);
              const n = parseInt(raw, 10);
              if (Number.isFinite(n) && n >= 0 && n <= 59) onMinute(n);
            }}
            className="h-9 w-20 text-center"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AppTimePicker · Diálogo SOLO hora.
// ---------------------------------------------------------------------------
interface AppTimePickerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value?: string; // "HH:mm"
  onConfirm: (v: string) => void;
  title?: string;
}

export function AppTimePicker({ open, onOpenChange, value, onConfirm, title = "SELECCIONAR HORA" }: AppTimePickerProps) {
  const parseVal = (v?: string): [number, number] => {
    if (!v) return [new Date().getHours(), 0];
    const [h, m] = v.split(":").map((x) => parseInt(x, 10));
    return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0];
  };

  const [hour, setHour] = useState<number>(0);
  const [minute, setMinute] = useState<number>(0);
  const [step, setStep] = useState<"h" | "m">("h");

  useEffect(() => {
    if (open) {
      const [h, m] = parseVal(value);
      setHour(h);
      setMinute(m);
      setStep("h");
    }
  }, [open, value]);

  const confirm = () => {
    onConfirm(`${pad2(hour)}:${pad2(minute)}`);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <ClockPanel
          hour={hour}
          minute={minute}
          step={step}
          onStep={setStep}
          onHour={setHour}
          onMinute={setMinute}
        />
        <DialogFooter className="gap-2 sm:justify-end">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={confirm}>
            Aceptar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// AppDateTimeInput · UN SOLO recuadro; abre un panel único con
// calendario y reloj (lado a lado en escritorio, apilados en móvil).
// ---------------------------------------------------------------------------
interface AppDateTimeInputProps {
  id?: string;
  name: string;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

/** Convierte ISO local "YYYY-MM-DDTHH:mm" a {date, time}. */
function splitIso(v?: string): { date?: Date; time: string } {
  if (!v) return { time: "" };
  const [d, t] = v.split("T");
  if (!d) return { time: "" };
  try {
    const dt = parse(d, "yyyy-MM-dd", new Date());
    return { date: isNaN(dt.getTime()) ? undefined : dt, time: t?.slice(0, 5) ?? "" };
  } catch {
    return { time: "" };
  }
}

function joinIso(date?: Date, time?: string): string {
  if (!date || !time) return "";
  return `${format(date, "yyyy-MM-dd")}T${time}`;
}

export function AppDateTimeInput({
  id,
  name,
  defaultValue,
  value: controlled,
  onChange,
  required,
  disabled,
  className,
  placeholder = "SELECCIONAR FECHA Y HORA",
}: AppDateTimeInputProps) {
  const isControlled = controlled !== undefined;
  const [internal, setInternal] = useState<string>(defaultValue ?? "");
  const value = isControlled ? controlled ?? "" : internal;

  const [open, setOpen] = useState(false);

  // Estado local del panel (se confirma al pulsar Aceptar).
  const [draftDate, setDraftDate] = useState<Date | undefined>();
  const [draftHour, setDraftHour] = useState<number>(0);
  const [draftMinute, setDraftMinute] = useState<number>(0);
  const [step, setStep] = useState<"h" | "m">("h");

  const { date, time } = useMemo(() => splitIso(value), [value]);

  useEffect(() => {
    if (open) {
      const now = new Date();
      setDraftDate(date ?? undefined);
      if (time) {
        const [h, m] = time.split(":").map((x) => parseInt(x, 10));
        setDraftHour(Number.isFinite(h) ? h : now.getHours());
        setDraftMinute(Number.isFinite(m) ? m : 0);
      } else {
        setDraftHour(now.getHours());
        setDraftMinute(0);
      }
      setStep("h");
    }
  }, [open, date, time]);

  const setValue = (v: string) => {
    if (!isControlled) setInternal(v);
    onChange?.(v);
  };

  const label = date && time ? `${format(date, "dd/MM/yyyy", { locale: es })}, ${time}` : "";

  const confirm = () => {
    if (!draftDate) return;
    setValue(joinIso(draftDate, `${pad2(draftHour)}:${pad2(draftMinute)}`));
    setOpen(false);
  };

  return (
    <>
      {/* Input oculto compatible con FormData */}
      <input type="hidden" id={id} name={name} value={value} required={required} readOnly />

      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "h-10 w-full justify-start rounded-md text-left font-normal",
          !label && "text-muted-foreground",
          className,
        )}
      >
        <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
        <span className="truncate">{label || placeholder}</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>SELECCIONAR FECHA Y HORA</DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-start">
            <div className="rounded-md border border-border bg-background">
              <Calendar
                mode="single"
                selected={draftDate}
                onSelect={(d) => setDraftDate(d ?? undefined)}
                initialFocus
                locale={es}
                className={cn("p-3 pointer-events-auto")}
              />
            </div>
            <div className="flex justify-center">
              <ClockPanel
                hour={draftHour}
                minute={draftMinute}
                step={step}
                onStep={setStep}
                onHour={setDraftHour}
                onMinute={setDraftMinute}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={confirm} disabled={!draftDate}>
              Aceptar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// AppTimeField · reemplazo directo de <input type="time" name>
// ---------------------------------------------------------------------------
export function AppTimeField({
  id,
  name,
  defaultValue,
  value: controlled,
  onChange,
  required,
  disabled,
  className,
  placeholder = "HH:mm",
}: {
  id?: string;
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (v: string) => void;
  required?: boolean;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}) {
  const isControlled = controlled !== undefined;
  const [internal, setInternal] = useState<string>(defaultValue ?? "");
  const value = isControlled ? controlled ?? "" : internal;
  const [open, setOpen] = useState(false);

  const setValue = (v: string) => {
    if (!isControlled) setInternal(v);
    onChange?.(v);
  };

  return (
    <>
      {name && <input type="hidden" id={id} name={name} value={value} required={required} readOnly />}
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "h-10 w-full justify-start rounded-md text-left font-normal",
          !value && "text-muted-foreground",
          className,
        )}
      >
        {value || placeholder}
      </Button>
      <AppTimePicker open={open} onOpenChange={setOpen} value={value} onConfirm={setValue} title="SELECCIONAR HORA" />
    </>
  );
}
