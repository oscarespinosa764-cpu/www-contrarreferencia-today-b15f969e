import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { normalizeForSearch } from "@/lib/text-normalize";

interface Props {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  /** Se dispara solo cuando el usuario elige una sugerencia */
  onPick?: (v: string) => void;
  options: string[];
  placeholder?: string;
  required?: boolean;
  id?: string;
  /** Muestra las opciones al enfocar aunque el campo esté vacío (contexto relacionado) */
  openAllOnFocus?: boolean;
  /** Mínimo de caracteres antes de mostrar sugerencias al escribir (def. 1) */
  minChars?: number;
}

// Normaliza para búsqueda: sin tildes, en minúsculas.
const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

export function AutoComplete({
  label,
  value,
  onChange,
  onPick,
  options,
  placeholder,
  required,
  id,
  openAllOnFocus,
  minChars = 1,
}: Props) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const raw = value.trim();
  const tokens = norm(raw).split(/\s+/).filter(Boolean);
  const enoughChars = raw.length >= minChars;
  // Sugerencia inteligente: muestra opciones al escribir (insensible a
  // mayúsculas/tildes, por coincidencia parcial), o al enfocar cuando hay
  // contexto relacionado. No abre la lista completa solo por enfocar.
  const filtered =
    tokens.length === 0
      ? openAllOnFocus
        ? options
        : []
      : enoughChars
        ? options.filter((o) => {
            const low = norm(o);
            return tokens.every((t) => low.includes(t));
          })
        : [];
  const visible = filtered.slice(0, 12);

  const pick = (v: string) => {
    onChange(v);
    onPick?.(v);
    setOpen(false);
    setActive(-1);
  };

  return (
    <div className="relative space-y-2">
      {label && <Label htmlFor={id}>{label}</Label>}
      <Input
        id={id}
        autoComplete="off"
        value={value}
        placeholder={placeholder}
        required={required}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (!open || !visible.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, visible.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(visible[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && visible.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {visible.map((o, i) => (
            <button
              key={o}
              type="button"
              className={`block w-full rounded px-2 py-1.5 text-left text-sm ${
                i === active ? "bg-accent text-accent-foreground" : "hover:bg-accent"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                if (blurTimer.current) clearTimeout(blurTimer.current);
                pick(o);
              }}
            >
              {o}
            </button>
          ))}
          {filtered.length > 12 && (
            <div className="px-2 py-1 text-[10px] text-muted-foreground">
              {filtered.length} resultados · refine la búsqueda
            </div>
          )}
        </div>
      )}
    </div>
  );
}
