import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Pencil, Loader2 } from "lucide-react";
import { listarFormulariosAdmin } from "@/lib/formularios.functions";
import { RED_OPERATIVA_FORM_CODE } from "@/lib/red-operativa-form-config";
import { FormularioEditorDialog } from "./formulario-editor-dialog";

interface Def {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  modulo: string;
  ruta: string;
  componente: string;
  activo: boolean;
  version_publicada_id: string | null;
  updated_at: string;
}

export function FormulariosPanel() {
  const [editing, setEditing] = useState<string | null>(null);
  const { data, isLoading, error } = useQuery({
    queryKey: ["formularios-admin"],
    queryFn: async () => {
      const r = await listarFormulariosAdmin();
      return (r ?? []) as Def[];
    },
  });

  return (
    <>
      <Panel title="Formularios administrables">
        <p className="mb-4 text-sm text-muted-foreground">
          Configure la presentación segura de formularios operativos: etiquetas, ayuda,
          orden, secciones, ancho y visibilidad de campos opcionales. No modifica datos,
          catálogos, validaciones ni obligatoriedad técnica.
        </p>
        {isLoading ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando definiciones…
          </div>
        ) : error ? (
          <p className="rounded-lg border border-status-red/40 bg-status-red/10 p-3 text-sm text-status-red">
            No se pudo cargar la lista de formularios.
          </p>
        ) : !data || data.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No hay formularios administrables.
          </p>
        ) : (
          <div className="space-y-2">
            {data.map((d) => (
              <div
                key={d.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{d.nombre}</p>
                  <p className="text-[11px] text-muted-foreground">
                    <span className="font-mono">{d.codigo}</span> · {d.modulo} · {d.ruta} ·{" "}
                    {d.componente}
                  </p>
                  {d.descripcion && (
                    <p className="mt-1 text-xs text-muted-foreground">{d.descripcion}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      d.version_publicada_id
                        ? "bg-status-green/15 text-status-green"
                        : "bg-status-amber/15 text-status-amber"
                    }`}
                  >
                    {d.version_publicada_id ? "PUBLICADO" : "SIN VERSIÓN"}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setEditing(d.codigo)}>
                    <Pencil className="mr-1.5 h-4 w-4" /> Configurar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
      {editing && (
        <FormularioEditorDialog
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          codigo={editing === RED_OPERATIVA_FORM_CODE ? editing : editing}
        />
      )}
    </>
  );
}
