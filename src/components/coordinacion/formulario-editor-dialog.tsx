import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDown, ArrowUp, Loader2, Save, Send, RotateCcw, FilePlus2 } from "lucide-react";
import {
  obtenerFormularioAdmin,
  crearBorradorFormulario,
  guardarBorradorFormulario,
  publicarVersionFormulario,
  restaurarVersionFormulario,
} from "@/lib/formularios.functions";
import {
  RED_OP_SECTIONS,
  RED_OP_WIDTHS,
  RED_OPERATIVA_FIELD_REGISTRY,
  buildDefaultConfig,
  invalidateFormularioConfig,
  normalizeConfig,
  type RedOpSectionKey,
  type RedOpWidth,
  type RedOperativaFormConfig,
} from "@/lib/red-operativa-form-config";
import { RedFormDialog } from "@/components/red/red-form-dialog";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  codigo: string;
}

interface Version {
  id: string;
  numero_version: number;
  estado: "BORRADOR" | "ACTIVA" | "ARCHIVADA";
  schema_config: unknown;
  motivo_cambio: string | null;
  created_at: string;
  published_at: string | null;
  archived_at: string | null;
}

interface Definicion {
  id: string;
  codigo: string;
  nombre: string;
  modulo: string;
  ruta: string;
  componente: string;
  version_publicada_id: string | null;
  updated_at: string;
}

export function FormularioEditorDialog({ open, onOpenChange, codigo }: Props) {
  const qc = useQueryClient();
  const [tab, setTab] = useState("resumen");
  const [borrador, setBorrador] = useState<RedOperativaFormConfig>(buildDefaultConfig());
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["formulario-admin-detalle", codigo],
    queryFn: async () => {
      const r = await obtenerFormularioAdmin({ data: { codigo } });
      return r as { definicion: Definicion; versiones: Version[] } | null;
    },
    enabled: open,
  });

  const def = data?.definicion ?? null;
  const versiones = data?.versiones ?? [];
  const activa = versiones.find((v) => v.estado === "ACTIVA") ?? null;
  const borradorRow = versiones.find((v) => v.estado === "BORRADOR") ?? null;

  // Cargar borrador (si existe) en el estado del editor.
  useEffect(() => {
    if (!open) return;
    if (borradorRow) {
      setBorrador(normalizeConfig(borradorRow.schema_config));
    } else if (activa) {
      setBorrador(normalizeConfig(activa.schema_config));
    } else {
      setBorrador(buildDefaultConfig());
    }
    setMotivo("");
  }, [open, borradorRow?.id, activa?.id]);

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ["formulario-admin-detalle", codigo] });
    qc.invalidateQueries({ queryKey: ["formularios-admin"] });
    refetch();
  };

  const crearBorrador = async () => {
    setBusy(true);
    try {
      await crearBorradorFormulario({ data: { codigo } });
      toast.success("Borrador creado");
      refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  const guardarBorrador = async () => {
    if (!borradorRow) return toast.error("No hay borrador activo");
    setBusy(true);
    try {
      await guardarBorradorFormulario({
        data: {
          codigo,
          versionId: borradorRow.id,
          schemaConfig: borrador,
          motivo: motivo || undefined,
        },
      });
      toast.success("Borrador guardado");
      refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setBusy(false);
    }
  };

  const publicar = async () => {
    if (!borradorRow) return toast.error("No hay borrador que publicar");
    if (!confirm("¿Publicar este borrador? La versión ACTIVA anterior se archivará.")) return;
    setBusy(true);
    try {
      // Guardar antes de publicar para preservar cambios en pantalla.
      await guardarBorradorFormulario({
        data: { codigo, versionId: borradorRow.id, schemaConfig: borrador, motivo: motivo || undefined },
      });
      await publicarVersionFormulario({ data: { codigo, versionId: borradorRow.id } });
      invalidateFormularioConfig(codigo);
      qc.invalidateQueries({ queryKey: ["formulario-publicado", codigo] });
      toast.success("Configuración publicada");
      refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error al publicar");
    } finally {
      setBusy(false);
    }
  };

  const restaurar = async (versionId: string) => {
    if (!confirm("¿Restaurar esta versión como nuevo borrador?")) return;
    setBusy(true);
    try {
      await restaurarVersionFormulario({ data: { codigo, versionId } });
      toast.success("Versión restaurada como borrador");
      refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  };

  // Helpers de edición del borrador
  const updateField = (key: string, patch: Partial<RedOperativaFormConfig["fields"][number]>) => {
    setBorrador((prev) => ({
      ...prev,
      fields: prev.fields.map((f) => (f.key === key ? { ...f, ...patch } : f)),
    }));
  };
  const updateSection = (
    key: RedOpSectionKey,
    patch: Partial<RedOperativaFormConfig["sections"][number]>,
  ) => {
    setBorrador((prev) => ({
      ...prev,
      sections: prev.sections.map((s) => (s.key === key ? { ...s, ...patch } : s)),
    }));
  };
  const moveSection = (key: RedOpSectionKey, dir: -1 | 1) => {
    setBorrador((prev) => {
      const arr = [...prev.sections].sort((a, b) => a.order - b.order);
      const idx = arr.findIndex((s) => s.key === key);
      const target = idx + dir;
      if (idx < 0 || target < 0 || target >= arr.length) return prev;
      const tmp = arr[idx].order;
      arr[idx] = { ...arr[idx], order: arr[target].order };
      arr[target] = { ...arr[target], order: tmp };
      return { ...prev, sections: arr };
    });
  };
  const moveField = (key: string, dir: -1 | 1) => {
    setBorrador((prev) => {
      const target = prev.fields.find((f) => f.key === key);
      if (!target) return prev;
      const grupo = prev.fields
        .filter((f) => f.section_key === target.section_key)
        .sort((a, b) => a.order - b.order);
      const idx = grupo.findIndex((f) => f.key === key);
      const otro = grupo[idx + dir];
      if (!otro) return prev;
      return {
        ...prev,
        fields: prev.fields.map((f) => {
          if (f.key === target.key) return { ...f, order: otro.order };
          if (f.key === otro.key) return { ...f, order: target.order };
          return f;
        }),
      };
    });
  };

  const camposPorSeccion = useMemo(() => {
    const m = new Map<RedOpSectionKey, RedOperativaFormConfig["fields"]>();
    for (const f of borrador.fields) {
      const key = f.section_key as RedOpSectionKey;
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(f);
    }
    return m;
  }, [borrador]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configurar formulario · {codigo}</DialogTitle>
          </DialogHeader>

          {isLoading || !def ? (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
            </div>
          ) : (
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="mb-3 grid w-full grid-cols-4 sm:grid-cols-7">
                <TabsTrigger value="resumen">Resumen</TabsTrigger>
                <TabsTrigger value="secciones">Secciones</TabsTrigger>
                <TabsTrigger value="campos">Campos</TabsTrigger>
                <TabsTrigger value="preview">Vista previa</TabsTrigger>
                <TabsTrigger value="versiones">Versiones</TabsTrigger>
                <TabsTrigger value="historial">Historial</TabsTrigger>
                <TabsTrigger value="tecnico">Estado técnico</TabsTrigger>
              </TabsList>

              {/* RESUMEN */}
              <TabsContent value="resumen">
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <Row label="Código" value={def.codigo} mono />
                  <Row label="Nombre" value={def.nombre} />
                  <Row label="Módulo" value={def.modulo} />
                  <Row label="Ruta" value={def.ruta} mono />
                  <Row label="Componente" value={def.componente} mono />
                  <Row
                    label="Versión activa"
                    value={activa ? `v${activa.numero_version}` : "—"}
                  />
                  <Row
                    label="Borrador"
                    value={borradorRow ? `v${borradorRow.numero_version}` : "sin borrador"}
                  />
                  <Row label="Actualizado" value={new Date(def.updated_at).toLocaleString()} />
                </dl>
                {!borradorRow && (
                  <Button className="mt-4" onClick={crearBorrador} disabled={busy}>
                    <FilePlus2 className="mr-1.5 h-4 w-4" /> Crear borrador
                  </Button>
                )}
              </TabsContent>

              {/* SECCIONES */}
              <TabsContent value="secciones">
                {!borradorRow && (
                  <p className="mb-3 rounded-md border border-status-amber/30 bg-status-amber/10 p-2 text-xs text-status-amber">
                    Cree un borrador desde “Resumen” para editar.
                  </p>
                )}
                <div className="space-y-2">
                  {[...borrador.sections]
                    .sort((a, b) => a.order - b.order)
                    .map((s) => (
                      <div key={s.key} className="rounded-lg border border-border p-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <span className="text-[11px] font-mono text-muted-foreground">
                            {s.key}
                          </span>
                          <div className="flex gap-1">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => moveSection(s.key, -1)}
                              disabled={!borradorRow}
                            >
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => moveSection(s.key, 1)}
                              disabled={!borradorRow}
                            >
                              <ArrowDown className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <Label className="text-xs">Etiqueta</Label>
                            <Input
                              value={s.label}
                              onChange={(e) => updateSection(s.key, { label: e.target.value })}
                              disabled={!borradorRow}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Descripción</Label>
                            <Input
                              value={s.description}
                              onChange={(e) =>
                                updateSection(s.key, { description: e.target.value })
                              }
                              disabled={!borradorRow}
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </TabsContent>

              {/* CAMPOS */}
              <TabsContent value="campos">
                {!borradorRow && (
                  <p className="mb-3 rounded-md border border-status-amber/30 bg-status-amber/10 p-2 text-xs text-status-amber">
                    Cree un borrador desde “Resumen” para editar.
                  </p>
                )}
                {[...borrador.sections]
                  .sort((a, b) => a.order - b.order)
                  .map((s) => {
                    const campos = (camposPorSeccion.get(s.key) ?? []).sort(
                      (a, b) => a.order - b.order,
                    );
                    if (campos.length === 0) return null;
                    return (
                      <div key={s.key} className="mb-4">
                        <h4 className="mb-2 text-sm font-bold text-foreground">
                          {s.label}
                        </h4>
                        <div className="space-y-2">
                          {campos.map((f) => {
                            const reg = RED_OPERATIVA_FIELD_REGISTRY[f.key];
                            if (!reg) return null;
                            return (
                              <div
                                key={f.key}
                                className="rounded-lg border border-border bg-card p-3"
                              >
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2">
                                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
                                      {f.key}
                                    </span>
                                    <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                                      {reg.data_type}
                                    </span>
                                    {reg.catalog_type && (
                                      <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                        {reg.catalog_type}
                                      </span>
                                    )}
                                    {reg.protected && (
                                      <span className="rounded bg-status-red/15 px-1.5 py-0.5 text-[10px] font-bold text-status-red">
                                        PROTEGIDO
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex gap-1">
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => moveField(f.key, -1)}
                                      disabled={!borradorRow}
                                    >
                                      <ArrowUp className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-7 w-7"
                                      onClick={() => moveField(f.key, 1)}
                                      disabled={!borradorRow}
                                    >
                                      <ArrowDown className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  <div>
                                    <Label className="text-xs">Etiqueta</Label>
                                    <Input
                                      value={f.label}
                                      maxLength={80}
                                      onChange={(e) =>
                                        updateField(f.key, { label: e.target.value })
                                      }
                                      disabled={!borradorRow}
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Placeholder</Label>
                                    <Input
                                      value={f.placeholder}
                                      maxLength={120}
                                      onChange={(e) =>
                                        updateField(f.key, { placeholder: e.target.value })
                                      }
                                      disabled={!borradorRow}
                                    />
                                  </div>
                                  <div className="sm:col-span-2">
                                    <Label className="text-xs">Texto de ayuda</Label>
                                    <Input
                                      value={f.help_text}
                                      maxLength={240}
                                      onChange={(e) =>
                                        updateField(f.key, { help_text: e.target.value })
                                      }
                                      disabled={!borradorRow}
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Sección</Label>
                                    <Select
                                      value={f.section_key}
                                      disabled={!borradorRow}
                                      onValueChange={(v) =>
                                        updateField(f.key, { section_key: v as RedOpSectionKey })
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {RED_OP_SECTIONS.map((k) => (
                                          <SelectItem key={k} value={k}>
                                            {k}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <div>
                                    <Label className="text-xs">Ancho</Label>
                                    <Select
                                      value={f.width}
                                      disabled={!borradorRow}
                                      onValueChange={(v) =>
                                        updateField(f.key, { width: v as RedOpWidth })
                                      }
                                    >
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {RED_OP_WIDTHS.map((w) => (
                                          <SelectItem key={w} value={w}>
                                            {w}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  {reg.optional_visibility ? (
                                    <div className="flex items-center gap-2 sm:col-span-2">
                                      <Switch
                                        checked={f.visible}
                                        onCheckedChange={(v) =>
                                          updateField(f.key, { visible: v })
                                        }
                                        disabled={!borradorRow}
                                      />
                                      <Label className="text-xs">
                                        Visible en el formulario
                                      </Label>
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-muted-foreground sm:col-span-2">
                                      Visibilidad protegida: este campo siempre se muestra.
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </TabsContent>

              {/* VISTA PREVIA */}
              <TabsContent value="preview">
                <p className="mb-3 rounded-md border border-primary/30 bg-primary/5 p-2 text-xs text-primary">
                  VISTA PREVIA — FORMULARIO NO OFICIAL. No se escriben datos.
                </p>
                <Button onClick={() => setPreviewOpen(true)}>Abrir vista previa</Button>
              </TabsContent>

              {/* VERSIONES */}
              <TabsContent value="versiones">
                <div className="space-y-2">
                  {versiones.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sin versiones aún.</p>
                  ) : (
                    versiones.map((v) => (
                      <div
                        key={v.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3 text-sm"
                      >
                        <div>
                          <p className="font-semibold">v{v.numero_version}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {v.estado} · creada {new Date(v.created_at).toLocaleString()}
                            {v.published_at && ` · publicada ${new Date(v.published_at).toLocaleString()}`}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              v.estado === "ACTIVA"
                                ? "bg-status-green/15 text-status-green"
                                : v.estado === "BORRADOR"
                                  ? "bg-status-amber/15 text-status-amber"
                                  : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {v.estado}
                          </span>
                          {v.estado !== "BORRADOR" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => restaurar(v.id)}
                              disabled={busy || !!borradorRow}
                            >
                              <RotateCcw className="mr-1 h-3.5 w-3.5" /> Restaurar
                            </Button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>

              {/* HISTORIAL */}
              <TabsContent value="historial">
                <p className="text-sm text-muted-foreground">
                  El historial completo se registra en Auditoría (acciones{" "}
                  <code>form_config_*</code>).
                </p>
              </TabsContent>

              {/* ESTADO TÉCNICO */}
              <TabsContent value="tecnico">
                <dl className="grid gap-2 text-sm sm:grid-cols-2">
                  <Row label="Formulario ID" value={def.id} mono />
                  <Row
                    label="Versión publicada"
                    value={def.version_publicada_id ?? "—"}
                    mono
                  />
                  <Row
                    label="Campos declarados"
                    value={String(Object.keys(RED_OPERATIVA_FIELD_REGISTRY).length)}
                  />
                  <Row label="Secciones" value={String(RED_OP_SECTIONS.length)} />
                </dl>
              </TabsContent>
            </Tabs>
          )}

          {borradorRow && (
            <div className="mt-4 rounded-lg border border-border bg-muted/40 p-3">
              <Label className="text-xs">Motivo del cambio (opcional)</Label>
              <Textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                maxLength={400}
                rows={2}
                className="mt-1"
              />
            </div>
          )}

          <DialogFooter className="mt-3 gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
            {borradorRow && (
              <>
                <Button onClick={guardarBorrador} disabled={busy} variant="outline">
                  <Save className="mr-1.5 h-4 w-4" /> Guardar borrador
                </Button>
                <Button onClick={publicar} disabled={busy}>
                  <Send className="mr-1.5 h-4 w-4" /> Publicar
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {previewOpen && (
        <RedFormDialog
          open={previewOpen}
          onOpenChange={setPreviewOpen}
          grupo="ips"
          editing={null}
          especialidades={[]}
          ipsOptions={[]}
          onSubmit={async () => {
            toast.info("Vista previa: guardar deshabilitado.");
            return false;
          }}
          configOverride={borrador}
          previewMode
          disableSubmit
        />
      )}
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className={mono ? "font-mono text-xs" : "text-sm"}>{value}</dd>
    </div>
  );
}
