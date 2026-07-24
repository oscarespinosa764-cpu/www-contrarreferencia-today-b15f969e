import { useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { fallback, zodValidator } from "@tanstack/zod-adapter";
import { supabase } from "@/lib/backend-client";
import { AppHeader } from "@/components/app-header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlantillasBiblioteca } from "@/components/coordinacion/plantillas-biblioteca";
import { CategoriasView } from "@/components/catalogo/categorias-view";
import { useCatalogoConfigDerivada } from "@/lib/catalogo-categorias";
import {
  BookOpen,
  Mail,
  Layers,
  ListChecks,
  FileText,
  Package,
  Clock,
} from "lucide-react";

const searchSchema = z.object({
  tab: fallback(z.string(), "catalogo").default("catalogo"),
});

export const Route = createFileRoute("/_authenticated/catalogo")({
  validateSearch: zodValidator(searchSchema),
  head: () => ({
    meta: [
      { title: "Catálogo y Plantillas · CEDIM IPS" },
      {
        name: "description",
        content:
          "Listas maestras del sistema y biblioteca de plantillas reutilizables.",
      },
    ],
  }),
  component: CatalogoPage,
});

type Kpis = {
  catalogos: number;
  elementos: number;
  plantillas: number;
  ultimaActualizacion: Date | null;
};

function useKpis() {
  return useQuery<Kpis>({
    queryKey: ["catalogo-kpis"],
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: cats }, { data: plantillas }] = await Promise.all([
        supabase
          .from("catalogos")
          .select("tipo, activo, updated_at")
          .limit(5000),
        supabase
          .from("plantillas")
          .select("id, activo, archivado, updated_at")
          .eq("archivado", false)
          .limit(5000),
      ]);
      const activos = (cats ?? []).filter((c) => c.activo);
      const tiposActivos = new Set(activos.map((c) => c.tipo));
      const ult =
        [
          ...(cats ?? []).map((c) => c.updated_at),
          ...(plantillas ?? []).map((p) => p.updated_at),
        ]
          .filter(Boolean)
          .map((d) => new Date(d as string).getTime())
          .sort((a, b) => b - a)[0] ?? null;
      return {
        catalogos: tiposActivos.size,
        elementos: activos.length,
        plantillas: (plantillas ?? []).filter((p) => p.activo).length,
        ultimaActualizacion: ult ? new Date(ult) : null,
      };
    },
  });
}

function CatalogoPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: k } = useKpis();
  const config = useCatalogoConfigDerivada();
  const categoriasActivas = config.categorias.filter((c) => c.activo).length;

  const kpis = useMemo(
    () => [
      {
        key: "categorias",
        icon: Layers,
        label: "Categorías",
        value: categoriasActivas || "—",
        hint: "Módulos con listas activas",
        tone: "bg-status-blue/10 text-status-blue",
        onClick: () => navigate({ search: { tab: "catalogo" } }),
      },
      {
        key: "catalogos",
        icon: ListChecks,
        label: "Catálogos",
        value: k?.catalogos ?? "—",
        hint: "Listas maestras",
        tone: "bg-emerald-500/10 text-emerald-600",
        onClick: () => navigate({ search: { tab: "catalogo" } }),
      },
      {
        key: "plantillas",
        icon: FileText,
        label: "Plantillas",
        value: k?.plantillas ?? "—",
        hint: "Disponibles",
        tone: "bg-violet-500/10 text-violet-600",
        onClick: () => navigate({ search: { tab: "plantillas" } }),
      },
      {
        key: "elementos",
        icon: Package,
        label: "Elementos totales",
        value: k?.elementos ?? "—",
        hint: "Registros en catálogos",
        tone: "bg-amber-500/10 text-amber-600",
        onClick: () => navigate({ search: { tab: "catalogo" } }),
      },
      {
        key: "ult",
        icon: Clock,
        label: "Última actualización",
        value: k?.ultimaActualizacion
          ? k.ultimaActualizacion.toLocaleDateString("es-CO", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })
          : "—",
        hint: k?.ultimaActualizacion
          ? k.ultimaActualizacion.toLocaleTimeString("es-CO", {
              hour: "2-digit",
              minute: "2-digit",
            })
          : "Sin cambios recientes",
        tone: "bg-sky-500/10 text-sky-600",
      },
    ],
    [k, navigate],
  );

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="Catálogo y Plantillas"
        subtitle="Listas maestras del sistema y biblioteca de plantillas reutilizables"
      />

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          const clickable = Boolean(kpi.onClick);
          return (
            <Card
              key={kpi.key}
              onClick={kpi.onClick}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={
                clickable
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        kpi.onClick?.();
                      }
                    }
                  : undefined
              }
              className={`flex items-center gap-3 p-4 transition ${
                clickable
                  ? "cursor-pointer hover:border-primary/40 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
                  : ""
              }`}
              aria-label={`${kpi.label}: ${kpi.value}`}
            >
              <div
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${kpi.tone}`}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-xs text-muted-foreground">
                  {kpi.label}
                </p>
                <p className="truncate text-2xl font-black leading-tight text-foreground">
                  {kpi.value}
                </p>
                <p className="truncate text-[10px] text-muted-foreground">
                  {kpi.hint}
                </p>
              </div>
            </Card>
          );
        })}
      </div>

      <Tabs
        value={tab}
        onValueChange={(v) => navigate({ search: { tab: v } })}
        className="flex flex-1 flex-col"
      >
        <TabsList className="mx-auto mb-4">
          <TabsTrigger value="catalogo" className="gap-1.5">
            <BookOpen className="h-4 w-4" /> Catálogo
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalogo" className="mt-0 flex-1">
          <CategoriasView />
        </TabsContent>
        <TabsContent value="plantillas" className="mt-0 flex-1">
          <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            <p className="mb-2 font-semibold text-foreground">Plantillas operativas movidas</p>
            <p>
              La administración de plantillas operativas (aceptación, negación, cancelación,
              seguimientos, textos para Índigo, PHD/PAD, etc.) ahora vive exclusivamente en{" "}
              <a
                className="font-semibold text-primary underline-offset-2 hover:underline"
                href="/control-mando?tab=plantillas"
              >
                Control de Mando → Plantillas del sistema → Plantillas operativas
              </a>
              .
            </p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
