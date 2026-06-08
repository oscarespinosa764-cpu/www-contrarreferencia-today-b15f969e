import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";

export function Field({
  name,
  label,
  required,
  defaultValue,
  type = "text",
  placeholder,
  readOnly,
}: {
  name: string;
  label: string;
  required?: boolean;
  defaultValue?: string;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name} className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-status-red">*</span>}
      </Label>
      <Input
        id={name}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        readOnly={readOnly}
        className={readOnly ? "cursor-not-allowed bg-muted text-muted-foreground" : undefined}
      />
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
  const listId = useId();
  const add = (forced?: string) => {
    const t = (forced ?? val).trim();
    if (!t) return;
    onChange([...items, t]);
    setVal("");
  };
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <div className="flex gap-2">
        <Input
          value={val}
          list={suggestions.length > 0 ? listId : undefined}
          onChange={(e) => {
            const v = e.target.value;
            setVal(v);
            // datalist exact pick → add immediately
            if (suggestions.includes(v)) add(v);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Escribe y agrega…"
        />
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
        <Button type="button" variant="outline" size="icon" className="shrink-0 rounded-full" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
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
