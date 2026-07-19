import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, CheckCircle2, Archive } from "lucide-react";

// ============================================================
// Panel administrativo de LISTAS DE CHEQUEO (Fase Q4).
// - Solo admin puede crear/editar/activar versiones.
// - Cada checklist tiene N versiones; solo UNA activa a la vez
//   (garantizado por índice único parcial en DB).
// - Los items se editan como filas simples (texto + requerido).
// - No integra generadores de PDF: eso es un paso posterior.
// ============================================================

type Checklist = {
  id: string;
  codigo: string;
  nombre: string;
  modulo: string;
  activo: boolean;
};

type ChecklistItem = { id: string; texto: string; requerido: boolean };

type Version = {
  id: string;
  checklist_id: string;
  version: number;
  estado: "BORRADOR" | "ACTIVA" | "ARCHIVADA";
  items: ChecklistItem[];
  notas: string | null;
  updated_at: string;
};

export function ChecklistsPanel() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();

  const { data: checklists } = useQuery<Checklist[]>({
    queryKey: ["cm-checklists"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklists")
        .select("id, codigo, nombre, modulo, activo")
        .order("codigo", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Checklist[];
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const seleccion = useMemo(
    () => (selectedId ? checklists?.find((c) => c.id === selectedId) : checklists?.[0]) ?? null,
    [checklists, selectedId],
  );

  const { data: versiones } = useQuery<Version[]>({
    queryKey: ["cm-checklist-versiones", seleccion?.id],
    enabled: !!seleccion?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_versiones")
        .select("id, checklist_id, version, estado, items, notas, updated_at")
        .eq("checklist_id", seleccion!.id)
        .order("version", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Version[];
    },
  });

  if (!isAdmin) {
    return (
      <p className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        Solo administradores pueden gestionar listas de chequeo.
      </p>
    );
  }

  const crearNuevaVersion = async () => {
    if (!seleccion) return;
    const proxima = ((versiones?.[0]?.version ?? 0) as number) + 1;
    const base = versiones?.[0]?.items ?? [];
    const { error } = await supabase.from("checklist_versiones").insert({
      checklist_id: seleccion.id,
      version: proxima,
      estado: "BORRADOR",
      items: base,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(`Versión ${proxima} creada en borrador`);
      qc.invalidateQueries({ queryKey: ["cm-checklist-versiones", seleccion.id] });
    }
  };

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">
      <aside className="space-y-2 rounded-xl border border-border bg-card p-3">
        <h3 className="text-sm font-semibold">Listas registradas</h3>
        <ul className="space-y-1">
          {(checklists ?? []).map((c) => {
            const active = seleccion?.id === c.id;
            return (
              <li key={c.id}>
                <button
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                    active
                      ? "border-primary bg-primary/10 text-foreground"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                >
                  <div className="font-medium uppercase">{c.nombre}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {c.codigo} · módulo {c.modulo}
                  </div>
                </button>
              </li>
            );
          })}
          {(!checklists || checklists.length === 0) && (
            <li className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
              Aún no hay listas registradas.
            </li>
          )}
        </ul>
      </aside>

      <section className="space-y-4 rounded-xl border border-border bg-card p-4">
        {!seleccion ? (
          <p className="text-sm text-muted-foreground">Seleccione una lista para gestionarla.</p>
        ) : (
          <>
            <header className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-semibold">{seleccion.nombre}</h3>
                <p className="text-xs text-muted-foreground">
                  {seleccion.codigo} · módulo {seleccion.modulo}
                </p>
              </div>
              <Button size="sm" onClick={crearNuevaVersion}>
                <Plus className="mr-1 h-4 w-4" /> Nueva versión (borrador)
              </Button>
            </header>

            <div className="space-y-3">
              {(versiones ?? []).map((v) => (
                <VersionCard key={v.id} version={v} />
              ))}
              {(!versiones || versiones.length === 0) && (
                <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                  Sin versiones. Cree la primera.
                </p>
              )}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function VersionCard({ version }: { version: Version }) {
  const qc = useQueryClient();
  const [items, setItems] = useState<ChecklistItem[]>(version.items ?? []);
  const [notas, setNotas] = useState(version.notas ?? "");
  const [dirty, setDirty] = useState(false);

  const editable = version.estado === "BORRADOR";

  const guardar = async () => {
    const { error } = await supabase
      .from("checklist_versiones")
      .update({ items, notas })
      .eq("id", version.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Versión guardada");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["cm-checklist-versiones", version.checklist_id] });
    }
  };

  const activar = async () => {
    // Archiva la actualmente activa y activa esta (transacción implícita del cliente).
    const { error: e1 } = await supabase
      .from("checklist_versiones")
      .update({ estado: "ARCHIVADA" })
      .eq("checklist_id", version.checklist_id)
      .eq("estado", "ACTIVA");
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await supabase
      .from("checklist_versiones")
      .update({ estado: "ACTIVA" })
      .eq("id", version.id);
    if (e2) return toast.error(e2.message);
    toast.success(`Versión ${version.version} activa`);
    qc.invalidateQueries({ queryKey: ["cm-checklist-versiones", version.checklist_id] });
  };

  const archivar = async () => {
    const { error } = await supabase
      .from("checklist_versiones")
      .update({ estado: "ARCHIVADA" })
      .eq("id", version.id);
    if (error) toast.error(error.message);
    else {
      toast.success(`Versión ${version.version} archivada`);
      qc.invalidateQueries({ queryKey: ["cm-checklist-versiones", version.checklist_id] });
    }
  };

  const addItem = () => {
    setItems((prev) => [
      ...prev,
      { id: `i${Date.now()}`, texto: "Nuevo ítem", requerido: false },
    ]);
    setDirty(true);
  };

  return (
    <article className="space-y-3 rounded-lg border border-border bg-background p-3">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">Versión {version.version}</span>
          <Badge
            variant={
              version.estado === "ACTIVA"
                ? "default"
                : version.estado === "BORRADOR"
                  ? "secondary"
                  : "outline"
            }
          >
            {version.estado}
          </Badge>
        </div>
        <div className="flex gap-2">
          {editable && dirty && (
            <Button size="sm" onClick={guardar}>
              Guardar cambios
            </Button>
          )}
          {version.estado === "BORRADOR" && (
            <Button size="sm" variant="outline" onClick={activar}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Activar
            </Button>
          )}
          {version.estado === "ACTIVA" && (
            <Button size="sm" variant="ghost" onClick={archivar}>
              <Archive className="mr-1 h-4 w-4" /> Archivar
            </Button>
          )}
        </div>
      </header>

      <div className="space-y-2">
        {items.map((it, idx) => (
          <div key={it.id} className="flex items-start gap-2 rounded-md border border-border/60 p-2">
            <Input
              value={it.texto}
              disabled={!editable}
              onChange={(e) => {
                const t = e.target.value;
                setItems((prev) => prev.map((x, i) => (i === idx ? { ...x, texto: t } : x)));
                setDirty(true);
              }}
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={it.requerido}
                disabled={!editable}
                onChange={(e) => {
                  const v = e.target.checked;
                  setItems((prev) =>
                    prev.map((x, i) => (i === idx ? { ...x, requerido: v } : x)),
                  );
                  setDirty(true);
                }}
              />
              Requerido
            </label>
            {editable && (
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setItems((prev) => prev.filter((_, i) => i !== idx));
                  setDirty(true);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
        {editable && (
          <Button size="sm" variant="outline" onClick={addItem}>
            <Plus className="mr-1 h-4 w-4" /> Agregar ítem
          </Button>
        )}
      </div>

      <div>
        <label className="text-xs text-muted-foreground">Notas de la versión</label>
        <Textarea
          value={notas}
          disabled={!editable}
          onChange={(e) => {
            setNotas(e.target.value);
            setDirty(true);
          }}
          rows={2}
        />
      </div>
    </article>
  );
}
