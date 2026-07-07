import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Loader2,
  ShieldCheck,
  Trash2,
  AlertTriangle,
  Search,
  Inbox,
  Send,
  House,
  GitBranch,
  ClipboardList,
  CalendarDays,
  Network,
  BarChart3,
  Bell,
  Command,
  QrCode,
  FileDown,
  Archive,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  limpiarDatos,
  contarDatos,
  GRUPOS_BORRADO,
  MODULOS_BORRADO,
  FRASE_CONFIRMACION_BORRADO,
  type GrupoBorradoKey,
} from "@/lib/borrado.functions";
import { registrarAuditoria } from "@/lib/auditoria.functions";

const TODAS_LAS_CLAVES = Object.keys(GRUPOS_BORRADO) as GrupoBorradoKey[];
const ES_PRODUCCION = import.meta.env.PROD;

// Icono por módulo (solo presentación en el cliente).
const ICONO_MODULO: Record<string, LucideIcon> = {
  entrantes: Inbox,
  salientes: Send,
  domiciliarios: House,
  referencias: GitBranch,
  pendientes: ClipboardList,
  cuadro_turno: CalendarDays,
  red: Network,
  indicadores: BarChart3,
  reglas_alertas: Bell,
  control_mando: Command,
  entrega_qr: QrCode,
  reportes: FileDown,
  historial: Archive,
};

type Filtro = "todos" | "con" | "sin" | "sel";

export function BorradoSeguroDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [sel, setSel] = useState<Set<GrupoBorradoKey>>(new Set());
  const [confirmacion, setConfirmacion] = useState("");
  const [backupOk, setBackupOk] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [conteos, setConteos] = useState<Record<string, number>>({});
  const [contando, setContando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const limpiar = useServerFn(limpiarDatos);
  const contar = useServerFn(contarDatos);

  const reset = () => {
    setSel(new Set());
    setConfirmacion("");
    setBackupOk(false);
    setConteos({});
    setBusqueda("");
    setFiltro("todos");
  };

  const cerrar = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  // Al abrir: audita la apertura y calcula el conteo de TODOS los grupos una
  // sola vez, para mostrar totales por módulo y por subgrupo desde el inicio.
  useEffect(() => {
    if (!open) return;
    let cancelado = false;
    registrarAuditoria({
      data: { accion: "abrir_zona_borrado", modulo: "borrado", resultado: "exito" },
    }).catch(() => {});
    setContando(true);
    contar({ data: { grupos: TODAS_LAS_CLAVES } })
      .then((res) => {
        if (cancelado || !res.ok) return;
        const map: Record<string, number> = {};
        for (const c of res.conteos) map[c.key] = c.total;
        setConteos(map);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelado) setContando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [open, contar]);

  const toggle = (k: GrupoBorradoKey) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });

  const toggleModulo = (subgrupos: GrupoBorradoKey[], marcar: boolean) =>
    setSel((prev) => {
      const next = new Set(prev);
      for (const k of subgrupos) {
        if (marcar) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const todos = () => setSel(new Set(TODAS_LAS_CLAVES));
  const ninguno = () => setSel(new Set());

  const conteoDe = (k: GrupoBorradoKey) => Math.max(0, conteos[k] ?? 0);
  const conteoModulo = (subgrupos: GrupoBorradoKey[]) =>
    subgrupos.reduce((a, k) => a + conteoDe(k), 0);

  const totalRegistros = Array.from(sel).reduce((a, k) => a + conteoDe(k), 0);
  // Módulos con al menos un subgrupo seleccionado.
  const modulosSeleccionados = MODULOS_BORRADO.filter((m) =>
    m.subgrupos.some((k) => sel.has(k)),
  ).length;

  // Filtra módulos/subgrupos por texto de búsqueda y por estado.
  const q = busqueda.trim().toLowerCase();
  const modulosFiltrados = useMemo(() => {
    return MODULOS_BORRADO.map((m) => {
      const coincideModulo =
        m.label.toLowerCase().includes(q) || m.descripcion.toLowerCase().includes(q);
      const subgrupos =
        !q || coincideModulo
          ? m.subgrupos
          : m.subgrupos.filter((k) => GRUPOS_BORRADO[k].label.toLowerCase().includes(q));
      return { mod: m, subgrupos };
    }).filter((x) => {
      // Búsqueda: el módulo debe coincidir o tener subgrupos coincidentes.
      if (q) {
        const coincideModulo =
          x.mod.label.toLowerCase().includes(q) ||
          x.mod.descripcion.toLowerCase().includes(q);
        if (!coincideModulo && x.subgrupos.length === 0) return false;
      }
      const total = conteoModulo(x.mod.subgrupos);
      const algunoSel = x.mod.subgrupos.some((k) => sel.has(k));
      if (filtro === "con") return !x.mod.vacio && total > 0;
      if (filtro === "sin") return x.mod.vacio || total === 0;
      if (filtro === "sel") return algunoSel;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filtro, conteos, sel]);

  const fraseOk = confirmacion.trim().toUpperCase() === FRASE_CONFIRMACION_BORRADO;
  const puedeEjecutar = sel.size > 0 && fraseOk && backupOk && !cargando;

  const ejecutar = async () => {
    if (sel.size === 0) return toast.error("Selecciona al menos un grupo de datos.");
    if (!fraseOk) return toast.error(`Escribe exactamente "${FRASE_CONFIRMACION_BORRADO}".`);
    if (!backupOk) return toast.error("Confirma que ya descargaste un respaldo.");
    setCargando(true);
    try {
      const res = await limpiar({
        data: { grupos: Array.from(sel), confirmacion, confirmacionBackup: backupOk },
      });
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo completar el borrado.");
        return;
      }
      const total = res.resultados.reduce((a, r) => a + r.eliminadas, 0);
      toast.success(`Borrado completado: ${total} registro(s) eliminado(s).`);
      cerrar(false);
    } catch (e) {
      console.error(e);
      toast.error("Error al ejecutar el borrado.");
    } finally {
      setCargando(false);
    }
  };

  const filtros: { id: Filtro; label: string }[] = [
    { id: "todos", label: "Todos" },
    { id: "con", label: "Con registros" },
    { id: "sin", label: "Sin registros" },
    { id: "sel", label: "Seleccionados" },
  ];

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-status-red">
            <Trash2 className="h-5 w-5" /> Zona de borrado seguro
          </DialogTitle>
          <DialogDescription>
            Organizada por módulos y subventanas, igual que Importaciones / Exportaciones. Vacía
            únicamente los datos transaccionales seleccionados. Esta acción no se puede deshacer.
          </DialogDescription>
        </DialogHeader>

        {ES_PRODUCCION && (
          <div className="flex items-center gap-2 rounded-xl border border-status-red/40 bg-status-red/10 px-3 py-2 text-xs font-bold text-status-red">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            AMBIENTE: PRODUCCIÓN — esta acción afectará datos reales.
          </div>
        )}

        <div className="flex items-start gap-2 rounded-xl border border-status-green/30 bg-status-green/10 px-3 py-2 text-xs text-foreground">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-status-green" />
          <span>
            <strong>Se preservan siempre</strong> usuarios, roles, catálogos, plantillas, reglas,
            red maestra, configuración, firmas maestras del personal, indicadores base y auditoría.
            Nunca se tocan.
          </span>
        </div>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar módulo, subventana o dato transaccional…"
            className="pl-9"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {filtros.map((f) => (
            <Button
              key={f.id}
              variant={filtro === f.id ? "default" : "outline"}
              size="sm"
              className="h-7 rounded-full text-xs"
              onClick={() => setFiltro(f.id)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            {sel.size} subgrupo(s) · {modulosSeleccionados} módulo(s)
          </Label>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={todos}>
              Todo
            </Button>
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={ninguno}>
              Ninguno
            </Button>
          </div>
        </div>

        <div className="max-h-[42vh] overflow-y-auto pr-1">
          <Accordion type="multiple" className="w-full space-y-1.5">
            {modulosFiltrados.map(({ mod, subgrupos }) => {
              const Icono = ICONO_MODULO[mod.id] ?? Archive;
              const totalMod = conteoModulo(mod.subgrupos);
              const selCount = mod.subgrupos.filter((k) => sel.has(k)).length;
              const allSel = selCount > 0 && selCount === mod.subgrupos.length;
              const someSel = selCount > 0;
              const seleccionable = !mod.vacio && mod.subgrupos.length > 0 && totalMod > 0;
              const checkState: boolean | "indeterminate" = allSel
                ? true
                : someSel
                  ? "indeterminate"
                  : false;
              return (
                <AccordionItem
                  key={mod.id}
                  value={mod.id}
                  className="rounded-xl border border-border bg-card px-3"
                >
                  <div className="flex items-center gap-2.5 py-1">
                    <Checkbox
                      checked={checkState}
                      disabled={!seleccionable}
                      onCheckedChange={(v) => toggleModulo(mod.subgrupos, v === true)}
                      aria-label={`Seleccionar módulo ${mod.label}`}
                    />
                    <AccordionTrigger className="flex-1 py-2 no-underline hover:no-underline">
                      <div className="flex flex-1 items-center justify-between gap-2 pr-2">
                        <div className="flex items-center gap-2.5 text-left">
                          <Icono className="h-5 w-5 shrink-0 text-primary" />
                          <div>
                            <p className="text-sm font-semibold text-foreground">{mod.label}</p>
                            <p className="text-[11px] text-muted-foreground">{mod.descripcion}</p>
                          </div>
                        </div>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            mod.vacio
                              ? "bg-muted text-muted-foreground"
                              : totalMod > 0
                                ? "bg-status-red/15 text-status-red"
                                : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {mod.vacio
                            ? "sin datos"
                            : contando
                              ? "…"
                              : `${totalMod} reg.`}
                        </span>
                      </div>
                    </AccordionTrigger>
                  </div>
                  <AccordionContent className="pb-2">
                    {mod.vacio ? (
                      <p className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                        {mod.nota}
                      </p>
                    ) : subgrupos.length === 0 ? (
                      <p className="px-1 py-2 text-xs text-muted-foreground">
                        Sin coincidencias en este módulo.
                      </p>
                    ) : (
                      <div className="space-y-1">
                        {subgrupos.map((k) => {
                          const def = GRUPOS_BORRADO[k];
                          const n = conteos[k];
                          return (
                            <label
                              key={k}
                              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border/60 bg-background px-3 py-2 hover:bg-muted/60"
                            >
                              <Checkbox checked={sel.has(k)} onCheckedChange={() => toggle(k)} />
                              <span className="flex-1 text-sm text-foreground">{def.label}</span>
                              <span className="shrink-0 rounded-full bg-status-red/15 px-2 py-0.5 text-[11px] font-bold text-status-red">
                                {contando && n === undefined
                                  ? "…"
                                  : n === -1
                                    ? "error"
                                    : `${n ?? 0} registro(s)`}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </AccordionContent>
                </AccordionItem>
              );
            })}
            {modulosFiltrados.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Sin coincidencias para los filtros actuales.
              </p>
            )}
          </Accordion>
        </div>

        {sel.size > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-status-red/30 bg-status-red/10 px-3 py-2 text-sm text-status-red">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Se eliminarán aproximadamente <strong>{totalRegistros}</strong> registro(s) en{" "}
              <strong>{modulosSeleccionados}</strong> módulo(s) y <strong>{sel.size}</strong>{" "}
              subgrupo(s). Esta acción es irreversible.
            </span>
          </div>
        )}

        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-card px-3 py-2">
          <Checkbox
            checked={backupOk}
            onCheckedChange={(v) => setBackupOk(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm text-foreground">
            Confirmo que realicé o verifiqué un <strong>respaldo previo</strong> y entiendo que este
            borrado no se puede deshacer.
            <br />
            <span className="text-[11px] text-muted-foreground">
              Si necesitas respaldo, usa primero <strong>RESPALDO TOTAL</strong> antes de ejecutar
              esta acción.
            </span>
          </span>
        </label>

        <div className="space-y-1.5">
          <Label htmlFor="confirma" className="text-xs">
            Para confirmar, escribe exactamente:
            <br />
            <strong className="text-status-red">{FRASE_CONFIRMACION_BORRADO}</strong>
          </Label>
          <Input
            id="confirma"
            value={confirmacion}
            onChange={(e) => setConfirmacion(e.target.value)}
            placeholder={FRASE_CONFIRMACION_BORRADO}
            autoComplete="off"
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => cerrar(false)} disabled={cargando}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={ejecutar} disabled={!puedeEjecutar}>
            {cargando ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Borrando…
              </>
            ) : (
              <>Vaciar {sel.size > 0 ? `${sel.size} subgrupo(s)` : ""}</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
