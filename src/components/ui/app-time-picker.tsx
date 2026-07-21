/**
 * AppTimePicker · reloj analógico 24h + wrapper de fecha + hora.
 *
 * — Conserva el selector de fecha actual (shadcn `Calendar` en `Popover`).
 * — Reemplaza el selector nativo de hora (`type="time"` / `datetime-local`)
 *   por un diálogo con reloj analógico de 24 horas.
 * — El valor se expone en un `<input hidden name=...>` con formato
 *   `YYYY-MM-DDTHH:mm` para preservar la compatibilidad con `FormData`.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarIcon, Clock } from "lucide-react";
import { format, parse } from "date-fns";
import { es } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ---------------------------------------------------------------------------
// AppTimePicker · reloj analógico 24h (Diálogo)
// ---------------------------------------------------------------------------
interface AppTimePickerProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  value?: string; // "HH:mm"
  onConfirm: (v: string) => void;
  title?: string;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const MINUTOS_MARCAS = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

export function AppTimePicker({ open, onOpenChange, value, onConfirm, title = "Seleccionar hora" }: AppTimePickerProps) {
  const parseVal = (v?: string): [number, number] => {
    if (!v) return [new Date().getHours(), 0];
    const [h, m] = v.split(":").map((x) => parseInt(x, 10));
    return [Number.isFinite(h) ? h : 0, Number.isFinite(m) ? m : 0];
  };

  const [hour, setHour] = useState<number>(0);
  const [minute, setMinute] = useState<number>(0);
  const [step, setStep] = useState<"h" | "m">("h");
  const [minutoManual, setMinutoManual] = useState<string>("");

  useEffect(() => {
    if (open) {
      const [h, m] = parseVal(value);
      setHour(h);
      setMinute(m);
      setMinutoManual(pad2(m));
      setStep("h");
    }
  }, [open, value]);

  const confirm = () => {
    onConfirm(`${pad2(hour)}:${pad2(minute)}`);
    onOpenChange(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (step === "h") setStep("m");
      else confirm();
    }
  };

  // Geometría del reloj (SVG)
  const CX = 130,
    CY = 130,
    R_OUT = 108,
    R_IN = 68;

  const posHour = (h: number) => {
    // 0..11 anillo interior (radio pequeño), 12..23 anillo exterior
    const outer = h === 12 || (h >= 13 && h <= 23);
    const r = outer ? R_OUT : R_IN;
    const angleDeg = ((h % 12) / 12) * 360 - 90; // 12 en la parte superior
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm" onKeyDown={onKey}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        {/* Header hora / minuto seleccionables */}
        <div className="flex items-center justify-center gap-1 rounded-md bg-primary/10 py-3 text-3xl font-bold tabular-nums">
          <button
            type="button"
            onClick={() => setStep("h")}
            className={cn(
              "rounded-md px-3 py-1",
              step === "h" ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-primary/20",
            )}
            aria-label="Editar hora"
          >
            {pad2(hour)}
          </button>
          <span className="opacity-70">:</span>
          <button
            type="button"
            onClick={() => setStep("m")}
            className={cn(
              "rounded-md px-3 py-1",
              step === "m" ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-primary/20",
            )}
            aria-label="Editar minutos"
          >
            {pad2(minute)}
          </button>
        </div>

        <div className="flex justify-center pt-2">
          <svg
            width={260}
            height={260}
            viewBox="0 0 260 260"
            role="group"
            aria-label={step === "h" ? "Reloj de horas (24h)" : "Reloj de minutos"}
          >
            <circle cx={CX} cy={CY} r={124} fill="hsl(var(--muted))" />
            {/* línea al valor seleccionado */}
            <line x1={CX} y1={CY} x2={selP.x} y2={selP.y} stroke="hsl(var(--primary))" strokeWidth={2} />
            <circle cx={selP.x} cy={selP.y} r={16} fill="hsl(var(--primary))" />
            <circle cx={CX} cy={CY} r={3} fill="hsl(var(--primary))" />

            {step === "h"
              ? horas.map((h) => {
                  const p = posHour(h);
                  const sel = h === hour;
                  return (
                    <g
                      key={h}
                      onClick={() => {
                        setHour(h);
                        // paso automático a minutos tras 250ms
                        window.setTimeout(() => setStep("m"), 200);
                      }}
                      className="cursor-pointer"
                    >
                      <circle cx={p.x} cy={p.y} r={14} fill="transparent" />
                      <text
                        x={p.x}
                        y={p.y + 4}
                        textAnchor="middle"
                        fontSize={h >= 12 ? 14 : 13}
                        fontWeight={sel ? 700 : 500}
                        fill={sel ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))"}
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
                      onClick={() => {
                        setMinute(m);
                        setMinutoManual(pad2(m));
                      }}
                      className="cursor-pointer"
                    >
                      <circle cx={p.x} cy={p.y} r={16} fill="transparent" />
                      <text
                        x={p.x}
                        y={p.y + 4}
                        textAnchor="middle"
                        fontSize={14}
                        fontWeight={sel ? 700 : 500}
                        fill={sel ? "hsl(var(--primary-foreground))" : "hsl(var(--foreground))"}
                      >
                        {pad2(m)}
                      </text>
                    </g>
                  );
                })}
          </svg>
        </div>

        {step === "m" && (
          <div className="flex items-center justify-center gap-2 pt-1">
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
                if (Number.isFinite(n) && n >= 0 && n <= 59) setMinute(n);
              }}
              className="h-9 w-20 text-center"
            />
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <div className="flex gap-2">
            {step === "h" ? (
              <Button type="button" onClick={() => setStep("m")}>
                Siguiente
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={() => setStep("h")}>
                ← Hora
              </Button>
            )}
            <Button type="button" onClick={confirm}>
              Aceptar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// AppDateTimeInput · reemplazo directo de <input type="datetime-local" name>
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
  placeholder = "Seleccionar…",
}: AppDateTimeInputProps) {
  const isControlled = controlled !== undefined;
  const [internal, setInternal] = useState<string>(defaultValue ?? "");
  const value = isControlled ? controlled ?? "" : internal;

  const [dateOpen, setDateOpen] = useState(false);
  const [timeOpen, setTimeOpen] = useState(false);

  const { date, time } = useMemo(() => splitIso(value), [value]);

  const setValue = (v: string) => {
    if (!isControlled) setInternal(v);
    onChange?.(v);
  };

  const setDate = (d?: Date) => {
    setValue(joinIso(d, time || format(new Date(), "HH:mm")));
    setDateOpen(false);
    // Abre automáticamente el reloj tras seleccionar fecha si aún no hay hora.
    if (d && !time) window.setTimeout(() => setTimeOpen(true), 150);
  };

  const setTime = (t: string) => setValue(joinIso(date ?? new Date(), t));

  const dateLabel = date ? format(date, "dd/MM/yyyy", { locale: es }) : "Fecha";
  const timeLabel = time || "Hora";

  return (
    <div className={cn("flex gap-2", className)}>
      {/* Input oculto compatible con FormData */}
      <input type="hidden" id={id} name={name} value={value} required={required} readOnly />

      <Popover open={dateOpen} onOpenChange={setDateOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn("h-10 flex-1 justify-start rounded-md text-left font-normal", !date && "text-muted-foreground")}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {date ? dateLabel : placeholder}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={date}
            onSelect={setDate}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
            locale={es}
          />
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        onClick={() => setTimeOpen(true)}
        className={cn("h-10 w-28 justify-start rounded-md text-left font-normal", !time && "text-muted-foreground")}
      >
        <Clock className="mr-2 h-4 w-4" />
        {timeLabel}
      </Button>

      <AppTimePicker
        open={timeOpen}
        onOpenChange={setTimeOpen}
        value={time}
        onConfirm={setTime}
        title="Seleccionar hora"
      />
    </div>
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
        className={cn("h-10 w-full justify-start rounded-md text-left font-normal", !value && "text-muted-foreground", className)}
      >
        <Clock className="mr-2 h-4 w-4" />
        {value || placeholder}
      </Button>
      <AppTimePicker open={open} onOpenChange={setOpen} value={value} onConfirm={setValue} />
    </>
  );
}
