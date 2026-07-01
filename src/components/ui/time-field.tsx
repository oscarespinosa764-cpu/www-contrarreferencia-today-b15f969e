import * as React from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Selector de HORA en formato militar (24h).
 * - Escritura manual (HH:MM).
 * - Selección desde columnas simples de horas (00–23) y minutos (00–55).
 * - Ícono de reloj para abrir el selector.
 * No usa el selector circular nativo.
 */

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, "0"));

function normalizar(v: string): string {
  // Deja solo dígitos y ":", tolera "1430" -> "14:30"
  let s = v.replace(/[^\d:]/g, "");
  if (s.length > 5) s = s.slice(0, 5);
  return s;
}

export type TimeFieldProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
};

export function TimeField({
  value,
  onChange,
  disabled,
  className,
  placeholder = "HH:MM",
  id,
}: TimeFieldProps) {
  const [open, setOpen] = React.useState(false);
  const [hh, mm] = (value || "").split(":");

  const setHora = (h: string) => onChange(`${h}:${mm && /^\d{2}$/.test(mm) ? mm : "00"}`);
  const setMin = (m: string) => onChange(`${hh && /^\d{2}$/.test(hh) ? hh : "00"}:${m}`);

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        value={value}
        inputMode="numeric"
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(normalizar(e.target.value))}
        onBlur={(e) => {
          // Completa "14" -> "14:00"; "1" -> "01:00"
          const raw = e.target.value.replace(/\D/g, "");
          if (!raw) return;
          const h = raw.slice(0, 2).padStart(2, "0");
          const m = (raw.slice(2, 4) || "00").padEnd(2, "0");
          const hClamp = String(Math.min(23, Number(h))).padStart(2, "0");
          const mClamp = String(Math.min(59, Number(m))).padStart(2, "0");
          onChange(`${hClamp}:${mClamp}`);
        }}
        className="pr-9"
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            disabled={disabled}
            className="absolute right-0 top-0 h-9 w-9 text-muted-foreground hover:text-foreground"
            aria-label="Abrir selector de hora"
          >
            <Clock className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="flex">
            <div className="max-h-56 w-16 overflow-y-auto border-r">
              <p className="sticky top-0 bg-muted px-2 py-1 text-center text-[10px] font-semibold uppercase text-muted-foreground">
                Hora
              </p>
              {HORAS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => setHora(h)}
                  className={cn(
                    "block w-full px-3 py-1 text-center text-sm hover:bg-accent",
                    hh === h && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className="max-h-56 w-16 overflow-y-auto">
              <p className="sticky top-0 bg-muted px-2 py-1 text-center text-[10px] font-semibold uppercase text-muted-foreground">
                Min
              </p>
              {MINUTOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMin(m)}
                  className={cn(
                    "block w-full px-3 py-1 text-center text-sm hover:bg-accent",
                    mm === m && "bg-primary text-primary-foreground hover:bg-primary",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
