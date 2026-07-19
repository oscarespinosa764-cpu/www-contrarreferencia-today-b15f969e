import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Layers, Truck, Ban, Users, Package } from "lucide-react";
import { CategoriaModal } from "./categoria-modal";

const TIPO_MODULO: Record<string, string> = {
  IPS: "Remisiones",
  IPS_LOCAL: "Remisiones",
  DEPARTAMENTO: "Remisiones",
  EAPB: "Remisiones",
  ESPECIALIDAD: "Remisiones",
  MEDICO: "Remisiones",
  REGIMEN: "Remisiones",
  TIPO_TRAMITE: "Remisiones",
  DOC_ENTREGA: "Remisiones",
  EMPRESA_TEP: "Ambulancias",
  PLACA: "Ambulancias",
  UNIDAD: "Ambulancias",
  UNIDAD_REQUERIDA: "Ambulancias",
  MOTIVO_CANCELACION: "Motivos",
  MOTIVO_NEG: "Motivos",
  MOTIVO_PERMISO: "Talento Humano",
};

const CATS = [
  {
    key: "Remisiones",
    icon: Layers,
    tone: "bg-status-blue/10 text-status-blue",
    desc: "IPS, EAPB, especialidades, médicos, trámites y entregas.",
  },
  {
    key: "Ambulancias",
    icon: Truck,
    tone: "bg-emerald-500/10 text-emerald-600",
    desc: "Empresas TEP, placas, unidades y unidades requeridas.",
  },
  {
    key: "Motivos",
    icon: Ban,
    tone: "bg-amber-500/10 text-amber-600",
    desc: "Motivos de cancelación y negación.",
  },
  {
    key: "Talento Humano",
    icon: Users,
    tone: "bg-violet-500/10 text-violet-600",
    desc: "Motivos de permiso del cuadro de turno.",
  },
  {
    key: "Otros",
    icon: Package,
    tone: "bg-slate-500/10 text-slate-600",
    desc: "Catálogos sin módulo asignado.",
  },
];

type Row = { tipo: string; activo: boolean };

export function CategoriasView() {
  const [open, setOpen] = useState<string | null>(null);

  const { data: counts } = useQuery({
    queryKey: ["catalogo-categorias-counts"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogos")
        .select("tipo, activo")
        .limit(5000);
      if (error) throw error;
      const acc: Record<
        string,
        { tipos: Set<string>; total: number; activos: number }
      > = {};
      for (const c of CATS)
        acc[c.key] = { tipos: new Set(), total: 0, activos: 0 };
      ((data ?? []) as Row[]).forEach((r) => {
        const m = TIPO_MODULO[r.tipo] ?? "Otros";
        if (!acc[m]) acc[m] = { tipos: new Set(), total: 0, activos: 0 };
        acc[m].tipos.add(r.tipo);
        acc[m].total++;
        if (r.activo) acc[m].activos++;
      });
      return acc;
    },
  });

  const cats = useMemo(
    () =>
      CATS.filter((c) => {
        const info = counts?.[c.key];
        return c.key !== "Otros" || (info && info.total > 0);
      }),
    [counts],
  );

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {cats.map((c) => {
          const Icon = c.icon;
          const info = counts?.[c.key];
          return (
            <Card
              key={c.key}
              role="button"
              tabIndex={0}
              onClick={() => setOpen(c.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(c.key);
                }
              }}
              className="cursor-pointer p-5 transition hover:border-primary/40 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label={`Abrir categoría ${c.key}`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${c.tone}`}
                >
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base font-black text-foreground">
                      {c.key}
                    </p>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {info?.tipos.size ?? 0} catálogos
                    </Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {c.desc}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span>
                      <strong className="text-foreground">
                        {info?.total ?? 0}
                      </strong>{" "}
                      elementos
                    </span>
                    <span>
                      <strong className="text-emerald-600">
                        {info?.activos ?? 0}
                      </strong>{" "}
                      activos
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {open && <CategoriaModal modulo={open} onClose={() => setOpen(null)} />}
    </>
  );
}
