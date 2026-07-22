import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings2 } from "lucide-react";
import { CategoriaModal } from "./categoria-modal";
import { AdminCategoriasDialog } from "./admin-categorias-dialog";
import {
  useCatalogoConfigDerivada,
  iconoDe,
  type CatalogoCategoria,
} from "@/lib/catalogo-categorias";
import { useAuth } from "@/lib/auth";

type Row = { tipo: string; activo: boolean };

export function CategoriasView() {
  const [open, setOpen] = useState<string | null>(null);
  const [adminOpen, setAdminOpen] = useState(false);
  const { isAdmin } = useAuth();
  const config = useCatalogoConfigDerivada();
  const queryClient = useQueryClient();

  const { data: counts, isError: countsError } = useQuery({
    queryKey: ["catalogo-categorias-counts"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogos")
        .select("tipo, activo")
        .limit(5000);
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  const cards = useMemo(() => {
    const acc: Record<
      string,
      { cat: CatalogoCategoria; tipos: Set<string>; total: number; activos: number }
    > = {};
    for (const c of config.categorias) {
      if (!c.activo) continue;
      acc[c.nombre] = { cat: c, tipos: new Set(), total: 0, activos: 0 };
    }
    for (const r of counts ?? []) {
      const nombre = config.tipoModulo[r.tipo];
      if (!nombre || !acc[nombre]) continue;
      acc[nombre].tipos.add(r.tipo);
      acc[nombre].total++;
      if (r.activo) acc[nombre].activos++;
    }
    return Object.values(acc)
      .filter((v) => v.cat.codigo !== "OTROS" || v.total > 0)
      .sort((a, b) => a.cat.orden - b.cat.orden);
  }, [config.categorias, config.tipoModulo, counts]);

  if (config.isError) {
    return (
      <Card className="p-6 text-center">
        <p className="text-sm font-semibold text-destructive">
          Error de configuración de categorías
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          No fue posible cargar la configuración persistente.
        </p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => config.refetch()}
        >
          Reintentar
        </Button>
      </Card>
    );
  }

  return (
    <>
      {isAdmin && (
        <div className="mb-3 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => setAdminOpen(true)}
          >
            <Settings2 className="mr-1.5 h-4 w-4" /> Administrar categorías
          </Button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {config.isLoading && cards.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
            Cargando categorías…
          </p>
        )}
        {!config.isLoading && cards.length === 0 && (
          <p className="col-span-full py-6 text-center text-sm text-muted-foreground">
            {countsError ? "Error cargando conteos." : "Sin categorías configuradas."}
          </p>
        )}
        {cards.map(({ cat, tipos, total, activos }) => {
          const Icon = iconoDe(cat.icono);
          return (
            <Card
              key={cat.id}
              role="button"
              tabIndex={0}
              onClick={() => setOpen(cat.nombre)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpen(cat.nombre);
                }
              }}
              className="cursor-pointer p-5 transition hover:border-primary/40 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              aria-label={`Abrir categoría ${cat.nombre}`}
            >
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-6 w-6" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-base font-black text-foreground">
                      {cat.nombre}
                    </p>
                    <Badge variant="secondary" className="shrink-0 text-[10px]">
                      {tipos.size} catálogos
                    </Badge>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {cat.descripcion ?? ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                    <span>
                      <strong className="text-foreground">{total}</strong>{" "}
                      elementos
                    </span>
                    <span>
                      <strong className="text-emerald-600">{activos}</strong>{" "}
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
      {adminOpen && (
        <AdminCategoriasDialog
          onClose={() => {
            setAdminOpen(false);
            queryClient.invalidateQueries({ queryKey: ["catalogo-categorias-config"] });
            queryClient.invalidateQueries({ queryKey: ["catalogo-tipos-config"] });
            queryClient.invalidateQueries({ queryKey: ["catalogo-categorias-counts"] });
          }}
        />
      )}
    </>
  );
}
