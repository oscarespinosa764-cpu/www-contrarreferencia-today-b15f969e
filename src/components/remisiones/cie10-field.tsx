import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Cie = { c: string; d: string };

let cache: Cie[] | null = null;
let loading: Promise<Cie[]> | null = null;
async function loadCie(): Promise<Cie[]> {
  if (cache) return cache;
  if (loading) return loading;
  loading = fetch("/cie10.json")
    .then((r) => r.json())
    .then((data: Cie[]) => {
      cache = data;
      return data;
    });
  return loading;
}

export function Cie10Field({
  name = "cie10",
  label = "CIE-10",
  required,
  defaultValue = "",
  onValueChange,
}: {
  name?: string;
  label?: string;
  required?: boolean;
  defaultValue?: string;
  onValueChange?: (v: string) => void;
}) {
  const [val, setVal] = useState(defaultValue);
  const [results, setResults] = useState<Cie[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const onChange = async (q: string) => {
    setVal(q);
    onValueChange?.(q);
    const term = q.trim().toLowerCase();
    if (term.length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    const list = await loadCie();
    const matches = list
      .filter((x) => x.c.toLowerCase().startsWith(term) || x.d.toLowerCase().includes(term))
      .slice(0, 30);
    setResults(matches);
    setOpen(matches.length > 0);
  };

  const pick = (x: Cie) => {
    const next = `${x.c} - ${x.d}`;
    setVal(next);
    onValueChange?.(next);
    setResults([]);
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
        placeholder="Código o descripción…"
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
      />
      {open && (
        <ul className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
          {results.map((x) => (
            <li key={x.c}>
              <button
                type="button"
                onClick={() => pick(x)}
                className="flex w-full gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              >
                <span className="shrink-0 font-mono font-semibold text-primary">{x.c}</span>
                <span className="truncate text-muted-foreground">{x.d}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
