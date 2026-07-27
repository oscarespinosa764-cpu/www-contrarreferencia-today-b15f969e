import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { AppDateTimeInput } from "@/components/ui/app-time-picker";
import { includesNormalized } from "@/lib/text-normalize";


export function Field({
  name,
  label,
  required,
  defaultValue,
  type = "text",
  placeholder,
  readOnly,
  uppercase,
}: {
  name: string;
  label: string;
  required?: boolean;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
  uppercase?: boolean;
}) {
  // Mayúscula automática en campos de texto operativos (no email/número/fecha/etc.).
  const autoUpper = uppercase ?? type === "text";
  // Limita el año a 4 dígitos en campos de fecha/hora (evita "12/12/122222").
  const dateMax =
    type === "datetime-local"
      ? "9999-12-31T23:59"
      : type === "date"
        ? "9999-12-31"
        : type === "month"
          ? "9999-12"
          : undefined;
  const dateMin =
    type === "datetime-local"
      ? "1900-01-01T00:00"
      : type === "date"
        ? "1900-01-01"
        : type === "month"
          ? "1900-01"
          : undefined;
  // Campos de fecha + hora: reemplazamos el nativo `datetime-local` por el
  // nuevo control (calendario actual + reloj analógico 24 h). Los campos de
  // solo fecha (`type="date"`) siguen usando el `<Input>` nativo actual.
  const esDatetime = type === "datetime-local";
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-status-red">*</span>}
      </Label>
      {esDatetime && !readOnly ? (
        <AppDateTimeInput id={name} name={name} required={required} defaultValue={defaultValue} />
      ) : (
        <Input
          id={name}
          name={name}
          type={type}
          required={required}
          defaultValue={defaultValue}
          placeholder={placeholder}
          readOnly={readOnly}
          max={dateMax}
          min={dateMin}
          uppercase={autoUpper}
          className={readOnly ? "cursor-not-allowed bg-muted text-muted-foreground" : undefined}
        />
      )}

    </div>
  );
}

export function SelectField({
  name,
  label,
  options,
  required,
  defaultValue,
  placeholder = "Seleccione…",
}: {
  name: string;
  label: string;
  options: string[];
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-status-red">*</span>}
      </Label>
      <select
        id={name}
        name={name}
        required={required}
        defaultValue={defaultValue ?? ""}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}

export function SpecialtyList({
  label,
  items,
  onChange,
  suggestions = [],
}: {
  label: string;
  items: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
}) {
  const [val, setVal] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const term = val.trim().toLowerCase();
  const matches =
    term.length === 0
      ? []
      : suggestions
          .filter((s) => s.toLowerCase().includes(term) && !items.includes(s))
          .slice(0, 30);

  const add = (forced?: string) => {
    const t = (forced ?? val).trim();
    if (!t) return;
    onChange([...items, t]);
    setVal("");
    setOpen(false);
  };

  return (
    <div className="relative space-y-1.5" ref={boxRef}>
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Input
        value={val}
        uppercase
        autoComplete="off"
        onChange={(e) => {
          setVal(e.target.value);
          setOpen(e.target.value.trim().length > 0);
        }}
        onFocus={() => setOpen(val.trim().length > 0)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(matches[0]);
          }
        }}
        placeholder="Escribe y agrega…"
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {matches.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => add(s)}
                className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {items.map((it, i) => (
            <Badge key={`${it}-${i}`} variant="secondary" className="gap-1">
              {it}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                className="rounded-full hover:text-destructive"
                aria-label={`Quitar ${it}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}

export function EdadField({
  name = "edad",
  label = "Edad",
  required,
}: {
  name?: string;
  label?: string;
  required?: boolean;
}) {
  const [val, setVal] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const numMatch = val.trim().match(/^(\d+)\s*([a-zA-Záéíóú]*)$/);
  const num = numMatch?.[1];
  const partial = (numMatch?.[2] ?? "").toLowerCase();
  const units = ["años", "meses", "días"];
  const matches = num
    ? units.filter((u) => u.startsWith(partial)).map((u) => `${num} ${u}`)
    : [];

  const pick = (s: string) => {
    setVal(s);
    setOpen(false);
  };

  return (
    <div className="relative space-y-1.5" ref={boxRef}>
      <Label htmlFor={name} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-status-red">*</span>}
      </Label>
      <Input
        id={name}
        name={name}
        value={val}
        required={required}
        autoComplete="off"
        placeholder="Ej: 15 años"
        onChange={(e) => {
          setVal(e.target.value);
          setOpen(e.target.value.trim().length > 0);
        }}
        onFocus={() => setOpen(matches.length > 0)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches.length > 0) {
            e.preventDefault();
            pick(matches[0]);
          }
        }}
      />
      {open && matches.length > 0 && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {matches.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => pick(s)}
                className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
