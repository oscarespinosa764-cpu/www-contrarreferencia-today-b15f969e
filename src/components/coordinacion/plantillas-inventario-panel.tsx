import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

// ============================================================
// Inventario de plantillas del sistema (Fase Q5).
// - Muestra las 7 plantillas registradas en plantillas_inventario.
// - Las marcadas PARCIAL exponen los campos declarados en
//   contenido_editable (JSON) para que el admin ajuste títulos,
//   encabezados y leyendas SIN tocar código.
// - Las SOLO_LECTURA muestran la leyenda oficial "DISEÑO
//   ADMINISTRABLE PENDIENTE DE DESARROLLO".
// - No cambia los generadores. La integración por generador es
//   un paso siguiente por-plantilla.
// ============================================================

type PlantillaInv = {
  id: string;
  codigo: string;
  nombre: string;
  modulo: string | null;
  editable_nivel: "SOLO_LECTURA" | "PARCIAL" | "TOTAL";
  formato: string | null;
  ruta_generador: string | null;
  descripcion: string | null;
  contenido_editable: Record<string, unknown>;
};

export function PlantillasInventarioPanel() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: rows } = useQuery<PlantillaInv[]>({
    queryKey: ["cm-plantillas-inv"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plantillas_inventario")
        .select(
          "id, codigo, nombre, modulo, editable_nivel, formato, ruta_generador, descripcion, contenido_editable",
        )
        .order("codigo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as PlantillaInv[];
    },
  });

  const [selectedCodigo, setSelectedCodigo] = useState<string | null>(null);
  const seleccion = useMemo(
    () => (rows ?? []).find((r) => r.codigo === selectedCodigo) ?? (rows ?? [])[0] ?? null,
    [rows, selectedCodigo],
  );

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[320px_1fr]">
      <aside className="space-y-2 rounded-xl border border-border bg-card p-3">
        <h3 className="text-sm font-semibold">Plantillas del sistema</h3>
        <ul className="space-y-1">
          {(rows ?? []).map((r) => {
            const active = seleccion?.id === r.id;
            return (
              <li key={r.id}>
                <button
                  onClick={() => setSelectedCodigo(r.codigo)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                    active
                      ? "border-primary bg-primary/10"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{r.codigo}</span>
                    <Badge
                      variant={
                        r.editable_nivel === "PARCIAL"
                          ? "default"
                          : r.editable_nivel === "TOTAL"
                            ? "default"
                            : "outline"
                      }
                    >
                      {r.editable_nivel}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-muted-foreground">{r.nombre}</div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <section className="space-y-3 rounded-xl border border-border bg-card p-4">
        {!seleccion ? (
          <p className="text-sm text-muted-foreground">Seleccione una plantilla.</p>
        ) : (
          <PlantillaEditor
            key={seleccion.id}
            plantilla={seleccion}
            canEdit={isAdmin}
            onSaved={() => qc.invalidateQueries({ queryKey: ["cm-plantillas-inv"] })}
          />
        )}
      </section>
    </div>
  );
}

function PlantillaEditor({
  plantilla,
  canEdit,
  onSaved,
}: {
  plantilla: PlantillaInv;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<Record<string, unknown>>(
    plantilla.contenido_editable ?? {},
  );
  const [dirty, setDirty] = useState(false);

  const soloLectura = plantilla.editable_nivel === "SOLO_LECTURA";
  const entries = Object.entries(plantilla.contenido_editable ?? {});

  const guardar = async () => {
    if (!canEdit || soloLectura) return;
    const { error } = await supabase
      .from("plantillas_inventario")
      .update({ contenido_editable: draft })
      .eq("id", plantilla.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Contenido guardado");
      setDirty(false);
      onSaved();
    }
  };

  const setField = (k: string, v: unknown) => {
    setDraft((d) => ({ ...d, [k]: v }));
    setDirty(true);
  };

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">{plantilla.nombre}</h3>
          <p className="text-xs text-muted-foreground">
            {plantilla.codigo} · módulo {plantilla.modulo ?? "—"} · formato{" "}
            {plantilla.formato ?? "—"}
          </p>
          {plantilla.descripcion && (
            <p className="mt-1 text-sm text-muted-foreground">{plantilla.descripcion}</p>
          )}
        </div>
        <Badge variant={soloLectura ? "outline" : "default"}>{plantilla.editable_nivel}</Badge>
      </header>

      {soloLectura ? (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
          DISEÑO ADMINISTRABLE PENDIENTE DE DESARROLLO. Esta plantilla se genera directamente
          desde código: <code className="rounded bg-muted px-1 py-0.5 text-xs">
            {plantilla.ruta_generador ?? "generador no registrado"}
          </code>
          .
        </div>
      ) : entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Esta plantilla no declara campos editables todavía.
        </p>
      ) : (
        <div className="space-y-3">
          {entries.map(([key, initialValue]) => {
            const current = draft[key] ?? initialValue;
            if (typeof initialValue === "boolean") {
              return (
                <label
                  key={key}
                  className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={!!current}
                    disabled={!canEdit}
                    onChange={(e) => setField(key, e.target.checked)}
                  />
                  <span className="font-medium">{prettifyKey(key)}</span>
                </label>
              );
            }
            if (typeof initialValue === "string" && initialValue.length > 60) {
              return (
                <div key={key} className="space-y-1">
                  <label className="text-xs font-medium">{prettifyKey(key)}</label>
                  <Textarea
                    value={String(current ?? "")}
                    disabled={!canEdit}
                    onChange={(e) => setField(key, e.target.value)}
                    rows={3}
                  />
                </div>
              );
            }
            return (
              <div key={key} className="space-y-1">
                <label className="text-xs font-medium">{prettifyKey(key)}</label>
                <Input
                  value={String(current ?? "")}
                  disabled={!canEdit}
                  onChange={(e) => setField(key, e.target.value)}
                />
              </div>
            );
          })}

          {canEdit && (
            <div className="flex justify-end">
              <Button size="sm" onClick={guardar} disabled={!dirty}>
                Guardar cambios
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function prettifyKey(k: string): string {
  return k.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
