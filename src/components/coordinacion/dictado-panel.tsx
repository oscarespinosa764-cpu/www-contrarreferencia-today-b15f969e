import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search, Pencil, Trash2, MapPin, Mic } from "lucide-react";
import { toast } from "sonner";
import {
  useDictationConfigRows,
  DICTATION_QUERY_KEY,
  type DictationConfigRow,
} from "@/lib/use-dictation-config";
import {
  DICTATION_REGISTRY,
  DICTATION_REGISTRY_BY_KEY,
  DICTATION_MODOS,
  type DictationInsertMode,
  type DictationFieldType,
} from "@/lib/dictation-registry";
import {
  DictadoFormDialog,
  type PuntoDictadoValues,
} from "@/components/coordinacion/dictado-form-dialog";

interface Punto extends PuntoDictadoValues {
  fromDb: boolean;
  dbId?: string;
  esRegistro: boolean;
  updated_at?: string;
  actualizado_por?: string | null;
}

const modoLabel = (m: string) =>
  DICTATION_MODOS.find((x) => x.value === m)?.label ?? m;

export function DictadoPanel() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const { data: rows, isLoading } = useDictationConfigRows();
  const [q, setQ] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Punto | null>(null);
  const [eliminar, setEliminar] = useState<Punto | null>(null);
  const [detalle, setDetalle] = useState<Punto | null>(null);

  const { data: perfiles } = useQuery({
    queryKey: ["perfiles-nombres"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, nombre");
      const map: Record<string, string> = {};
      (data ?? []).forEach((p: any) => (map[p.user_id] = p.nombre));
      return map;
    },
    staleTime: 300_000,
  });

  const refrescar = () => qc.invalidateQueries({ queryKey: DICTATION_QUERY_KEY });

  const audit = (accion: string, detalles: Record<string, unknown>) =>
    registrarAuditoria({
      data: { accion, modulo: "control_mando", tabla: "voice_dictation_config", detalles },
    }).catch(() => {});

  const puntos = useMemo<Punto[]>(() => {
    const dbByKey = new Map((rows ?? []).map((r) => [r.key, r]));
    const list: Punto[] = [];

    const fromRow = (r: DictationConfigRow, esRegistro: boolean): Punto => ({
      key: r.key,
      modulo: r.modulo,
      ventana: r.ventana,
      subventana: r.subventana,
      nombre_campo: r.nombre_campo,
      selector: r.selector,
      tipo_campo: (r.tipo_campo as DictationFieldType) ?? "textarea",
      modo_insercion: (r.modo_insercion as DictationInsertMode) ?? "append",
      idioma: r.idioma,
      activo: r.activo,
      roles_permitidos: r.roles_permitidos ?? ["admin", "operativa"],
      texto_ayuda: r.texto_ayuda,
      fromDb: true,
      dbId: r.id,
      esRegistro,
      updated_at: r.updated_at,
      actualizado_por: r.actualizado_por,
    });

    for (const item of DICTATION_REGISTRY) {
      const r = dbByKey.get(item.key);
      if (r) {
        list.push(fromRow(r, true));
      } else {
        list.push({
          key: item.key,
          modulo: item.modulo,
          ventana: item.ventana,
          subventana: item.subventana,
          nombre_campo: item.nombre_campo,
          selector: item.selector,
          tipo_campo: item.tipo_campo,
          modo_insercion: item.modo_insercion,
          idioma: item.idioma,
          activo: item.activo,
          roles_permitidos: item.roles_permitidos,
          texto_ayuda: null,
          fromDb: false,
          esRegistro: true,
        });
      }
    }
    for (const r of rows ?? []) {
      if (!DICTATION_REGISTRY_BY_KEY[r.key]) list.push(fromRow(r, false));
    }
    return list;
  }, [rows]);

  const term = q.trim().toLowerCase();
  const filtrados = useMemo(
    () =>
      puntos.filter((p) =>
        term
          ? [p.modulo, p.ventana, p.subventana, p.nombre_campo, p.key]
              .join(" ")
              .toLowerCase()
              .includes(term)
          : true,
      ),
    [puntos, term],
  );

  const activos = puntos.filter((p) => p.activo).length;

  const upsert = async (values: PuntoDictadoValues, existing?: Punto): Promise<boolean> => {
    const payload: Record<string, unknown> = {
      key: values.key,
      modulo: values.modulo,
      ventana: values.ventana,
      subventana: values.subventana,
      nombre_campo: values.nombre_campo,
      selector: values.selector,
      tipo_campo: values.tipo_campo,
      modo_insercion: values.modo_insercion,
      idioma: values.idioma,
      activo: values.activo,
      roles_permitidos: values.roles_permitidos,
      texto_ayuda: values.texto_ayuda,
      actualizado_por: user?.id ?? null,
    };

    if (existing?.dbId) {
      const { error } = await (supabase as any)
        .from("voice_dictation_config")
        .update(payload)
        .eq("id", existing.dbId);
      if (error) {
        toast.error(error.message);
        return false;
      }
      audit("editar_punto_dictado", { key: values.key, nombre: values.nombre_campo });
    } else {
      const { error } = await (supabase as any)
        .from("voice_dictation_config")
        .insert({ ...payload, creado_por: user?.id ?? null });
      if (error) {
        toast.error(error.message);
        return false;
      }
      audit("crear_punto_dictado", { key: values.key, nombre: values.nombre_campo });
    }
    toast.success("Configuración guardada");
    refrescar();
    return true;
  };

  const toggle = async (p: Punto) => {
    const ok = await upsert({ ...p, activo: !p.activo }, p);
    if (ok)
      audit(p.activo ? "desactivar_punto_dictado" : "activar_punto_dictado", { key: p.key });
  };

  const confirmarEliminar = async () => {
    if (!eliminar?.dbId) return;
    const { error } = await (supabase as any)
      .from("voice_dictation_config")
      .delete()
      .eq("id", eliminar.dbId);
    if (error) return toast.error(error.message);
    audit("eliminar_punto_dictado", { key: eliminar.key });
    toast.success("Configuración eliminada");
    setEliminar(null);
    refrescar();
  };

  const probar = (key: string, selector?: string | null) => {
    const esc =
      typeof CSS !== "undefined" && CSS.escape ? CSS.escape(key) : key;
    const candidatos = [
      `[data-dictation-key="${key}"]`,
      selector || "",
      `#${esc}`,
      `[name="${esc}"]`,
    ].filter(Boolean);
    let encontrado: Element | null = null;
    let selectorInvalido = false;
    for (const sel of candidatos) {
      try {
        const el = document.querySelector(sel);
        if (el) {
          encontrado = el;
          break;
        }
      } catch {
        selectorInvalido = true;
      }
    }
    if (encontrado) {
      const compatible =
        encontrado instanceof HTMLTextAreaElement ||
        encontrado instanceof HTMLInputElement ||
        (encontrado as HTMLElement).isContentEditable;
      if (compatible) toast.success("Campo encontrado correctamente.");
      else
        toast.warning(
          "Campo encontrado, pero no es compatible con dictado (no es área de texto editable).",
        );
    } else if (selectorInvalido) {
      toast.error("Selector inválido. Revise la configuración.");
    } else {
      toast.warning(
        "No se encontró el campo en esta pantalla. Esta ubicación solo puede probarse desde la ventana correspondiente.",
      );
    }
    audit("probar_ubicacion_dictado", { key });
  };

  return (
    <Panel
      title="Dictado por voz"
      action={
        isAdmin && (
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="mr-1.5 h-4 w-4" /> Nuevo punto de dictado
          </Button>
        )
      }
    >
      <p className="mb-1 text-center text-[11px] text-muted-foreground">
        Configuración de campos habilitados para transcripción por micrófono.
      </p>
      <p className="mb-3 text-center text-[11px] text-muted-foreground">
        {puntos.length} punto(s) · {activos} activo(s)
      </p>

      <div className="relative mx-auto mb-4 max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="rounded-full pl-9"
          placeholder="Buscar punto de dictado…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {isLoading ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Cargando…</p>
      ) : (
        <div className="grid gap-3">
          {filtrados.map((p) => (
            <div
              key={p.key}
              className={`rounded-xl border border-border border-l-4 bg-card p-4 shadow-sm ${
                p.activo ? "border-l-primary" : "border-l-border opacity-70"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                    <Mic className="h-4 w-4 text-primary" /> {p.nombre_campo}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">
                      {p.modulo}
                    </span>
                    {p.ventana && (
                      <span className="text-muted-foreground">{p.ventana}</span>
                    )}
                    {p.subventana && (
                      <span className="text-muted-foreground">· {p.subventana}</span>
                    )}
                  </p>
                  <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                    {p.key}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {p.tipo_campo} · {modoLabel(p.modo_insercion)} · {p.idioma} ·{" "}
                    {p.roles_permitidos.join(", ")}
                  </p>
                  {!p.fromDb && (
                    <p className="mt-0.5 text-[10px] italic text-muted-foreground">
                      Valor por defecto del sistema (sin cambios guardados).
                    </p>
                  )}
                </div>
                {isAdmin && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Switch checked={p.activo} onCheckedChange={() => toggle(p)} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Probar ubicación"
                      onClick={() => probar(p.key, p.selector)}
                    >
                      <MapPin className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="Editar"
                      onClick={() => {
                        setEditing(p);
                        setFormOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {p.fromDb && !p.esRegistro && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-status-red"
                        title="Eliminar"
                        onClick={() => setEliminar(p)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                )}
              </div>
              {p.updated_at && (
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Última actualización: {new Date(p.updated_at).toLocaleString("es-CO")}
                  {p.actualizado_por && perfiles?.[p.actualizado_por]
                    ? ` · ${perfiles[p.actualizado_por]}`
                    : ""}
                </p>
              )}
            </div>
          ))}
          {filtrados.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No hay puntos que coincidan con la búsqueda.
            </p>
          )}
        </div>
      )}

      <DictadoFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        editing={editing}
        isRegistro={!!editing?.esRegistro}
        onSubmit={(values) => upsert(values, editing ?? undefined)}
        onTest={probar}
      />

      <AlertDialog open={!!eliminar} onOpenChange={(v) => !v && setEliminar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar punto de dictado?</AlertDialogTitle>
            <AlertDialogDescription>
              «{eliminar?.nombre_campo}» dejará de estar configurado. Esta acción no afecta
              datos de pacientes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmarEliminar}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Panel>
  );
}
