import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Plus, Search, Pencil, X, SearchCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { registrarAuditoria } from "@/lib/auditoria.functions";

type CatRow = {
  id: string;
  tipo: string;
  valor: string;
  extra1: string | null;
  extra2: string | null;
  extra3: string | null;
  activo: boolean;
  radica_phd?: boolean | null;
  radica_pad?: boolean | null;
  radica_oxigeno?: boolean | null;
  radica_unidad_especial?: boolean | null;
  seguimientos_en_plataforma?: boolean | null;
  /** Regla operativa (Fase 5E C.5). No depende de ninguna dirección de correo. */
  evolucion_por_correo?: boolean | null;
  /** LEGADO: dato de contacto; no participa en reglas operativas. */
  eapb_correo_radicacion?: string | null;
  eapb_sla_horas?: number | null;
  eapb_requisitos_radicacion?: string | null;
};

// Etiqueta legible + dónde se usa + módulo agrupador
const TIPO_META: Record<
  string,
  { label: string; usadoEn: string; modulo: string; extra1Label?: string; extra2Label?: string }
> = {
  IPS: {
    label: "IPS / Red",
    usadoEn: "Remisiones · Red operativa",
    modulo: "Remisiones",
    extra1Label: "Ciudad – Departamento (separar sedes con ;)",
  },
  EAPB: {
    label: "EAPB / Aseguradoras",
    usadoEn: "Remisiones · Referencia interna",
    modulo: "Remisiones",
    extra1Label: "Tiene plataforma (SI/NO)",
    extra2Label: "Genera código de radicación (SI/NO)",
  },
  TIPO_TRAMITE: { label: "Tipos de trámite", usadoEn: "Remisiones salientes · Trazabilidad Índigo", modulo: "Remisiones" },
  IPS_LOCAL: { label: "IPS red local", usadoEn: "Remisiones salientes · Trazabilidad Índigo", modulo: "Remisiones" },
  DEPARTAMENTO: { label: "Departamentos red nacional", usadoEn: "Remisiones salientes · Trazabilidad Índigo", modulo: "Remisiones" },
  ESPECIALIDAD: { label: "Especialidades", usadoEn: "Remisiones · Médicos", modulo: "Remisiones" },
  MEDICO: {
    label: "Médicos / Profesionales",
    usadoEn: "Remisiones",
    modulo: "Remisiones",
    extra1Label: "Título (Dr., Dra., etc.)",
    extra2Label: "Especialidad",
  },
  REGIMEN: { label: "Regímenes", usadoEn: "Remisiones", modulo: "Remisiones" },
  EMPRESA_TEP: { label: "Empresas TEP", usadoEn: "Ambulancias · Traslados", modulo: "Ambulancias" },
  PLACA: { label: "Placas", usadoEn: "Ambulancias · Traslados", modulo: "Ambulancias" },
  UNIDAD: {
    label: "Unidades",
    usadoEn: "Remisiones · Vencimientos",
    modulo: "Ambulancias",
    extra1Label: "Horas",
    extra2Label: "Horas ampliación",
  },
  UNIDAD_REQUERIDA: { label: "Unidades requeridas", usadoEn: "Remisiones", modulo: "Ambulancias" },
  MOTIVO_CANCELACION: {
    label: "Motivos de cancelación",
    usadoEn: "Remisiones",
    modulo: "Motivos",
    extra1Label: "Justificación",
  },
  MOTIVO_NEG: { label: "Motivos de negación", usadoEn: "Remisiones", modulo: "Motivos" },
  DOC_ENTREGA: {
    label: "Documentos de entrega",
    usadoEn: "Remisiones salientes · Entrega documental (firma QR)",
    modulo: "Remisiones",
    extra1Label: "Origen (EPS / ARL / SOAT / PARTICULAR / COMÚN)",
  },
  MOTIVO_PERMISO: {
    label: "Motivos de permiso",
    usadoEn: "Cuadro de turno · Solicitud de permiso (TH-FR-09)",
    modulo: "Talento Humano",
    extra1Label: "Recuperable (RECUPERABLE / NO_RECUPERABLE)",
  },
};

function metaOf(tipo: string) {
  return TIPO_META[tipo] ?? { label: tipo, usadoEn: "Catálogo operativo", modulo: "Otros" };
}

const MODULOS = ["Todos", "Remisiones", "Ambulancias", "Motivos", "Talento Humano", "Otros"];

// ---------- Detección de similares ----------
function normalize(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string) {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

function similarity(a: string, b: string) {
  const na = normalize(a);
  const nb = normalize(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  // contención (una contiene a la otra)
  if (na.includes(nb) || nb.includes(na)) return 0.95;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

function detectarClusters(rows: CatRow[], umbral = 0.82) {
  // union-find
  const parent = rows.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => {
    parent[find(a)] = find(b);
  };
  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      if (similarity(rows[i].valor, rows[j].valor) >= umbral) union(i, j);
    }
  }
  const groups: Record<number, CatRow[]> = {};
  rows.forEach((r, i) => {
    const root = find(i);
    (groups[root] ??= []).push(r);
  });
  return Object.values(groups).filter((g) => g.length > 1);
}

export function CatalogoMaestras({ moduloFijo }: { moduloFijo?: string } = {}) {
  const qc = useQueryClient();
  const [qInput, setQInput] = useState("");
  const [q, setQ] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput), 250);
    return () => clearTimeout(t);
  }, [qInput]);
  const [modulo, setModulo] = useState(moduloFijo ?? "Todos");
  useEffect(() => {
    if (moduloFijo) setModulo(moduloFijo);
  }, [moduloFijo]);
  const [tipoSel, setTipoSel] = useState<string | null>(null);
  const [nuevoValor, setNuevoValor] = useState("");
  // Origen para documentos de entrega (DOC_ENTREGA) al agregar en línea.
  const [nuevoOrigenDoc, setNuevoOrigenDoc] = useState("COMUN");
  const [nuevoRecuperable, setNuevoRecuperable] = useState("NO_RECUPERABLE");
  const [editing, setEditing] = useState<CatRow | null>(null);
  const [borrar, setBorrar] = useState<CatRow | null>(null);
  const [simOpen, setSimOpen] = useState(false);
  // Sedes/detalles dinámicos (solo IPS): se almacenan juntos en extra1 separados por " ; ".
  const [sedes, setSedes] = useState<string[]>([]);
  // Indicadores de radicado por tipo (solo EAPB).
  const [radicaFlags, setRadicaFlags] = useState({
    radica_phd: false,
    radica_pad: false,
    radica_oxigeno: false,
    radica_unidad_especial: false,
  });

  useEffect(() => {
    if (editing && editing.tipo === "IPS") {
      const parts = [editing.extra1, editing.extra2]
        .filter(Boolean)
        .flatMap((s) => String(s).split(/\s*;\s*/))
        .map((s) => s.trim())
        .filter(Boolean);
      setSedes(parts.length ? parts : [""]);
    }
    if (editing && editing.tipo === "EAPB") {
      setRadicaFlags({
        radica_phd: !!editing.radica_phd,
        radica_pad: !!editing.radica_pad,
        radica_oxigeno: !!editing.radica_oxigeno,
        radica_unidad_especial: !!editing.radica_unidad_especial,
      });
    }
  }, [editing]);

  const { data: items, isLoading } = useQuery({
    queryKey: ["catalogo-todos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("catalogos")
        .select(
          "id, tipo, valor, extra1, extra2, extra3, activo, radica_phd, radica_pad, radica_oxigeno, radica_unidad_especial, seguimientos_en_plataforma, evolucion_por_correo, eapb_correo_radicacion, eapb_sla_horas, eapb_requisitos_radicacion",
        )
        .neq("tipo", "plantilla")
        .order("tipo")
        .order("valor");
      if (error) throw error;
      return (data ?? []) as CatRow[];
    },
  });

  const tipos = useMemo(() => {
    const map = new Map<string, CatRow[]>();
    (items ?? []).forEach((i) => {
      const arr = map.get(i.tipo) ?? [];
      arr.push(i);
      map.set(i.tipo, arr);
    });
    return Array.from(map.entries())
      .map(([tipo, list]) => ({ tipo, list, meta: metaOf(tipo) }))
      .sort((a, b) => a.meta.label.localeCompare(b.meta.label));
  }, [items]);

  const tipoTerm = q.trim().toLowerCase();
  const tiposVisibles = useMemo(
    () =>
      tipos
        .filter((t) => modulo === "Todos" || t.meta.modulo === modulo)
        .filter((t) =>
          tipoTerm ? `${t.meta.label} ${t.meta.usadoEn} ${t.tipo}`.toLowerCase().includes(tipoTerm) : true,
        ),
    [tipos, modulo, tipoTerm],
  );

  const conteoModulo = (m: string) =>
    m === "Todos" ? tipos.length : tipos.filter((t) => t.meta.modulo === m).length;

  // tipo seleccionado efectivo
  const sel =
    tiposVisibles.find((t) => t.tipo === tipoSel) ?? tiposVisibles[0] ?? null;
  const selMeta = sel ? sel.meta : null;
  const selList = sel ? sel.list : [];

  const clusters = useMemo(() => (sel ? detectarClusters(sel.list) : []), [sel]);

  const handleAdd = async () => {
    if (!sel || !nuevoValor.trim()) return;
    const payload: { tipo: string; valor: string; activo: boolean; extra1?: string } = {
      tipo: sel.tipo,
      valor: nuevoValor.trim(),
      activo: true,
    };
    if (sel.tipo === "DOC_ENTREGA") payload.extra1 = nuevoOrigenDoc;
    if (sel.tipo === "MOTIVO_PERMISO") payload.extra1 = nuevoRecuperable;
    const { error } = await supabase.from("catalogos").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Valor agregado");
    setNuevoValor("");
    qc.invalidateQueries({ queryKey: ["catalogo-todos"] });
  };


  const toggle = async (id: string, activo: boolean) => {
    const { error } = await supabase.from("catalogos").update({ activo }).eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["catalogo-todos"] });
  };

  const handleSaveEdit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!editing) return;
    const f = new FormData(e.currentTarget);
    const isIPS = editing.tipo === "IPS";
    const extra1 = isIPS
      ? sedes.map((s) => s.trim()).filter(Boolean).join(" ; ") || null
      : ((String(f.get("extra1")).trim() || null) as string | null);
    const extra2 = isIPS ? null : ((String(f.get("extra2")).trim() || null) as string | null);
    const extra3 =
      editing.tipo === "EAPB" ? ((String(f.get("extra3")).trim() || null) as string | null) : editing.extra3;
    const isEAPB = editing.tipo === "EAPB";
    const nuevoSegPlataforma = isEAPB
      ? String(f.get("seguimientos_en_plataforma")) === "SI"
      : undefined;
    const nuevoEvoCorreo = isEAPB ? String(f.get("evolucion_por_correo")) === "SI" : undefined;
    const slaRaw = isEAPB ? String(f.get("eapb_sla_horas") ?? "").trim() : "";
    const slaNum = slaRaw ? Number(slaRaw) : NaN;
    const radicaPatch = isEAPB
      ? {
          radica_phd: radicaFlags.radica_phd,
          radica_pad: radicaFlags.radica_pad,
          radica_oxigeno: radicaFlags.radica_oxigeno,
          radica_unidad_especial: radicaFlags.radica_unidad_especial,
          seguimientos_en_plataforma: nuevoSegPlataforma,
          evolucion_por_correo: nuevoEvoCorreo,
          // eapb_correo_radicacion es LEGADO (dato de contacto): no se edita ni
          // se reescribe desde este formulario operativo.
          eapb_sla_horas: Number.isFinite(slaNum) && slaNum > 0 ? slaNum : null,
          eapb_requisitos_radicacion:
            (String(f.get("eapb_requisitos_radicacion") ?? "").trim() || null) as string | null,
        }
      : {};
    const { error } = await supabase
      .from("catalogos")
      .update({
        valor: String(f.get("valor")).trim(),
        extra1,
        extra2,
        extra3,
        ...radicaPatch,
      })
      .eq("id", editing.id);
    if (error) return toast.error(error.message);
    // Auditar cambio de las reglas operativas de evolución (solo si cambiaron).
    if (
      isEAPB &&
      (!!editing.seguimientos_en_plataforma !== nuevoSegPlataforma ||
        !!editing.evolucion_por_correo !== nuevoEvoCorreo)
    ) {
      registrarAuditoria({
        data: {
          accion: "editar_eapb_reglas_evolucion",
          modulo: "catalogos",
          tabla: "catalogos",
          registroId: editing.id,
          resultado: "exito",
          detalles: {
            plataforma_anterior: editing.seguimientos_en_plataforma ? "SI" : "NO",
            plataforma_nuevo: nuevoSegPlataforma ? "SI" : "NO",
            correo_anterior: editing.evolucion_por_correo ? "SI" : "NO",
            correo_nuevo: nuevoEvoCorreo ? "SI" : "NO",
          },
        },
      }).catch(() => {});
    }
    toast.success("Elemento actualizado");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["catalogo-todos"] });
  };

  const handleDelete = async () => {
    if (!borrar) return;
    const { error } = await supabase.from("catalogos").delete().eq("id", borrar.id);
    if (error) return toast.error(error.message);
    toast.success("Elemento eliminado");
    setBorrar(null);
    qc.invalidateQueries({ queryKey: ["catalogo-todos"] });
  };

  if (isLoading) {
    return <p className="py-12 text-center text-sm text-muted-foreground">Cargando catálogo…</p>;
  }

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm">
      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)]">
        {/* ---------- Sidebar ---------- */}
        <aside className="border-b border-border p-4 lg:border-b-0 lg:border-r">
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="rounded-full pl-9"
              placeholder="Buscar tipo de catálogo…"
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
            />
          </div>

          {!moduloFijo && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {MODULOS.map((m) => (
                <button
                  key={m}
                  onClick={() => setModulo(m)}
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                    modulo === m
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:bg-accent"
                  }`}
                >
                  {m} ({conteoModulo(m)})
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1 overflow-y-auto pr-1 lg:max-h-[calc(100vh-22rem)]">
            {tiposVisibles.map((t) => {
              const active = sel?.tipo === t.tipo;
              return (
                <button
                  key={t.tipo}
                  onClick={() => setTipoSel(t.tipo)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left transition-colors ${
                    active
                      ? "border-primary bg-primary/10"
                      : "border-transparent hover:border-border hover:bg-muted/60"
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-foreground">
                      {t.meta.label}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {t.meta.usadoEn}
                    </span>
                  </span>
                  <Badge variant="secondary" className="shrink-0">
                    {t.list.length}
                  </Badge>
                </button>
              );
            })}
            {tiposVisibles.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin resultados.</p>
            )}
          </div>
        </aside>

        {/* ---------- Detalle ---------- */}
        <section className="min-w-0 p-5">
          {!sel || !selMeta ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              Selecciona un tipo de catálogo.
            </p>
          ) : (
            <>
              <header className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-black text-foreground">{selMeta.label}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selList.length} valores configurados
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5 border-amber-400 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                  onClick={() => setSimOpen(true)}
                >
                  <SearchCheck className="h-4 w-4" />
                  Detectar similares
                  {clusters.length > 0 && (
                    <Badge className="ml-1 bg-amber-500 text-white">{clusters.length}</Badge>
                  )}
                </Button>
              </header>

              <div className="mt-3 rounded-xl border border-border bg-muted/40 px-3 py-2">
                <span className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                  Usado en
                </span>{" "}
                <span className="text-xs font-medium text-foreground">{selMeta.usadoEn}</span>
              </div>

              {/* Agregar inline */}
              <div className="mt-3 flex gap-2">
                {sel.tipo === "DOC_ENTREGA" && (
                  <select
                    value={nuevoOrigenDoc}
                    onChange={(e) => setNuevoOrigenDoc(e.target.value)}
                    className="h-9 shrink-0 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                    title="Origen al que aplica el documento"
                  >
                    <option value="COMUN">COMÚN (todos)</option>
                    <option value="EPS">EPS</option>
                    <option value="ARL">ARL</option>
                    <option value="SOAT">SOAT</option>
                    <option value="PARTICULAR">PARTICULAR</option>
                  </select>
                )}
                {sel.tipo === "MOTIVO_PERMISO" && (
                  <select
                    value={nuevoRecuperable}
                    onChange={(e) => setNuevoRecuperable(e.target.value)}
                    className="h-9 shrink-0 rounded-md border border-input bg-background px-2 text-sm shadow-sm"
                    title="¿El tiempo del permiso es recuperable?"
                  >
                    <option value="NO_RECUPERABLE">No recuperable</option>
                    <option value="RECUPERABLE">Recuperable</option>
                  </select>
                )}
                <Input
                  placeholder={`Nuevo valor en ${selMeta.label}…`}
                  value={nuevoValor}
                  onChange={(e) => setNuevoValor(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAdd();
                    }
                  }}
                />

                <Button onClick={handleAdd} className="shrink-0 gap-1.5">
                  <Plus className="h-4 w-4" /> Agregar
                </Button>
              </div>

              {/* Lista de valores */}
              <div className="mt-4 grid gap-2 overflow-y-auto pr-1 sm:grid-cols-2 lg:max-h-[calc(100vh-28rem)]">
                {selList.map((i) => (
                  <div
                    key={i.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 shadow-sm ${
                      i.activo ? "border-border" : "border-dashed border-border opacity-70"
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground" title={i.valor}>
                        {i.valor}
                      </p>
                      {(i.extra1 || i.extra2) && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {[i.extra1, i.extra2].filter(Boolean).join(" · ")}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Switch checked={i.activo} onCheckedChange={(v) => toggle(i.id, v)} />
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7"
                        onClick={() => setEditing(i)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => setBorrar(i)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {selList.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
                    Sin valores. Agrega el primero arriba.
                  </p>
                )}
              </div>
            </>
          )}
        </section>
      </div>

      {/* ---------- Dialog editar ---------- */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar elemento</DialogTitle>
            {selMeta && <DialogDescription>{selMeta.label}</DialogDescription>}
          </DialogHeader>
          {editing && (
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="valor">Nombre / valor</Label>
                <Input id="valor" name="valor" defaultValue={editing.valor} required />
              </div>

              {editing.tipo === "IPS" ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label>Sedes / detalles</Label>
                    <span className="text-[11px] text-muted-foreground">
                      {sedes.filter((s) => s.trim()).length} agregada(s)
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Agrega una casilla por cada sede (ciudad – departamento). Usa el botón para
                    añadir las que necesites.
                  </p>
                  <div className="space-y-2">
                    {sedes.map((s, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          value={s}
                          placeholder={`Sede / detalle ${idx + 1}`}
                          onChange={(e) =>
                            setSedes((prev) => prev.map((v, i) => (i === idx ? e.target.value : v)))
                          }
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-9 w-9 shrink-0 text-destructive hover:text-destructive"
                          disabled={sedes.length <= 1}
                          onClick={() => setSedes((prev) => prev.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setSedes((prev) => [...prev, ""])}
                  >
                    <Plus className="h-4 w-4" /> Agregar sede / detalle
                  </Button>
                </div>
              ) : editing.tipo === "EAPB" ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="extra3">Tipo de entidad</Label>
                    <select
                      id="extra3"
                      name="extra3"
                      defaultValue={editing.extra3 ?? "EPS"}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="EPS">EPS</option>
                      <option value="ASEGURADORA">ASEGURADORA</option>
                      <option value="ARL">ARL</option>
                      <option value="PREPAGADA">PREPAGADA</option>
                      <option value="NO APLICA">NO APLICA</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="extra1">Tiene plataforma</Label>
                    <select
                      id="extra1"
                      name="extra1"
                      defaultValue={editing.extra1 ?? "NO"}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="SI">Sí</option>
                      <option value="NO">No</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="extra2">Genera código de radicación</Label>
                    <select
                      id="extra2"
                      name="extra2"
                      defaultValue={editing.extra2 ?? "NO"}
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                    >
                      <option value="SI">Sí</option>
                      <option value="NO">No</option>
                    </select>
                  </div>
                  <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Reglas de evolución
                    </Label>
                    <div className="space-y-1.5">
                      <Label htmlFor="evolucion_por_correo" className="text-xs">
                        EVOLUCIÓN POR CORREO ELECTRÓNICO
                      </Label>
                      <select
                        id="evolucion_por_correo"
                        name="evolucion_por_correo"
                        defaultValue={editing.evolucion_por_correo ? "SI" : "NO"}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                      >
                        <option value="SI">Sí</option>
                        <option value="NO">No</option>
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="seguimientos_en_plataforma" className="text-xs">
                        EVOLUCIÓN EN PLATAFORMA WEB
                      </Label>
                      <select
                        id="seguimientos_en_plataforma"
                        name="seguimientos_en_plataforma"
                        defaultValue={editing.seguimientos_en_plataforma ? "SI" : "NO"}
                        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                      >
                        <option value="SI">Sí</option>
                        <option value="NO">No</option>
                      </select>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Reglas operativas de la Evolución Diaria. No dependen de ninguna dirección de
                      correo: los datos de contacto se consultarán en RED &amp; DISPONIBILIDAD.
                    </p>
                  </div>
                  <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-3">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Genera radicado para (PHD/PAD/O2/Especiales)
                    </Label>
                    {(
                      [
                        { key: "radica_phd", label: "Genera radicado para PHD" },
                        { key: "radica_pad", label: "Genera radicado para PAD" },
                        { key: "radica_oxigeno", label: "Genera radicado para Oxígeno domiciliario" },
                        { key: "radica_unidad_especial", label: "Genera radicado para Unidades especiales" },
                      ] as const
                    ).map((opt) => (
                      <label key={opt.key} className="flex items-center justify-between gap-2 text-sm">
                        <span>{opt.label}</span>
                        <Switch
                          checked={radicaFlags[opt.key]}
                          onCheckedChange={(v) =>
                            setRadicaFlags((p) => ({ ...p, [opt.key]: !!v }))
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-3">
                    <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Configuración de radicación PHD/PAD/O2/Especiales
                    </Label>
                    <div className="space-y-1.5">
                      <Label htmlFor="eapb_sla_horas" className="text-xs">
                        SLA de respuesta (horas)
                      </Label>
                      <Input
                        id="eapb_sla_horas"
                        name="eapb_sla_horas"
                        type="number"
                        min={1}
                        step={1}
                        placeholder="Ej. 24"
                        defaultValue={editing.eapb_sla_horas ?? ""}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="eapb_requisitos_radicacion" className="text-xs">
                        Requisitos de radicación
                      </Label>
                      <textarea
                        id="eapb_requisitos_radicacion"
                        name="eapb_requisitos_radicacion"
                        rows={3}
                        defaultValue={editing.eapb_requisitos_radicacion ?? ""}
                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        placeholder="Documentos, formatos u observaciones requeridas por la EAPB."
                      />
                    </div>
                  </div>
                </>
              ) : editing.tipo === "DOC_ENTREGA" ? (
                <div className="space-y-2">
                  <Label htmlFor="extra1">Origen al que aplica</Label>
                  <select
                    id="extra1"
                    name="extra1"
                    defaultValue={(editing.extra1 || "COMUN").toUpperCase()}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="COMUN">COMÚN (todos los orígenes)</option>
                    <option value="EPS">EPS</option>
                    <option value="ARL">ARL</option>
                    <option value="SOAT">SOAT</option>
                    <option value="PARTICULAR">PARTICULAR</option>
                  </select>
                </div>
              ) : editing.tipo === "ESPECIALIDAD" ? (
                <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
                  <Label
                    htmlFor="nueva_eps_rnc_correo_adicional"
                    className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    Requiere correo adicional (NUEVA EPS · RED NO CONTRATADA)
                  </Label>
                  <select
                    id="nueva_eps_rnc_correo_adicional"
                    name="nueva_eps_rnc_correo_adicional"
                    defaultValue={editing.nueva_eps_rnc_correo_adicional ? "SI" : "NO"}
                    className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm"
                  >
                    <option value="SI">Sí</option>
                    <option value="NO">No</option>
                  </select>
                  <p className="text-[11px] text-muted-foreground">
                    Si está en Sí, la Evolución Diaria de casos NUEVA EPS con RED NO CONTRATADA
                    exigirá CORREO ELECTRÓNICO además de PLATAFORMA WEB.
                  </p>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="extra1">
                      {metaOf(editing.tipo).extra1Label ?? "Detalle (opcional)"}
                    </Label>
                    <Input id="extra1" name="extra1" defaultValue={editing.extra1 ?? ""} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="extra2">
                      {metaOf(editing.tipo).extra2Label ?? "Detalle 2 (opcional)"}
                    </Label>
                    <Input id="extra2" name="extra2" defaultValue={editing.extra2 ?? ""} />
                  </div>
                </>
              )}

              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                  Cancelar
                </Button>
                <Button type="submit">Guardar</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog borrar ---------- */}
      <Dialog open={!!borrar} onOpenChange={(o) => !o && setBorrar(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar elemento</DialogTitle>
            <DialogDescription>
              ¿Seguro que deseas eliminar «{borrar?.valor}»? Esta acción no se puede deshacer.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBorrar(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ---------- Dialog detectar similares ---------- */}
      <Dialog open={simOpen} onOpenChange={setSimOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <SearchCheck className="h-5 w-5 text-amber-500" />
              Posibles duplicados en {selMeta?.label}
            </DialogTitle>
            <DialogDescription>
              Se comparan los nombres dentro de este catálogo para detectar repeticiones o
              variaciones de escritura.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
            {clusters.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No se encontraron similitudes. 🎉
              </p>
            ) : (
              clusters.map((group, idx) => (
                <div key={idx} className="rounded-xl border border-amber-300 bg-amber-50/60 p-3 dark:bg-amber-950/20">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-amber-700 dark:text-amber-400">
                    Grupo {idx + 1} · {group.length} similares
                  </p>
                  <div className="space-y-1.5">
                    {group.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-lg bg-card px-2.5 py-1.5"
                      >
                        <span className="min-w-0 truncate text-sm text-foreground" title={r.valor}>
                          {r.valor}
                          {!r.activo && (
                            <span className="ml-1 text-[10px] text-muted-foreground">(inactivo)</span>
                          )}
                        </span>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => {
                              setSimOpen(false);
                              setEditing(r);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive hover:text-destructive"
                            onClick={() => {
                              setSimOpen(false);
                              setBorrar(r);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSimOpen(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
