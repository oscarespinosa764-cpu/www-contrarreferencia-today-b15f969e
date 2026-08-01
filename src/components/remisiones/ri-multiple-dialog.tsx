// FASE 5I — TRASLADO MÚLTIPLE TAB (Referencias Internas).
//
// Genera UN solo QR de firma para varios pacientes que viajan en la misma
// ambulancia TAB de la misma empresa. Reutiliza estrictamente la infraestructura
// canónica: `entrega_firmas` + ruta pública `/firma-entrega` + `firmarEntrega`.
// Al firmar, el servidor registra la CONFIRMACIÓN DE LLEGADA DE AMBULANCIA en
// cada caso vinculado, exactamente igual que en el flujo individual.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Copy, QrCode, Ban, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import {
  crearSesionFirmaMultipleRI,
  anularSesion,
  urlFirma,
  type SnapshotEntrega,
} from "@/lib/entrega-documental";
import { registrarAuditoria } from "@/lib/auditoria.functions";

type CasoRI = Record<string, unknown>;

const norm = (v: unknown) =>
  (v ?? "")
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toUpperCase();

/** Elegibilidad: estado AMBULANCIA PROGRAMADA + ambulancia TAB / básica. */
export function esElegibleTrasladoMultiple(c: CasoRI): boolean {
  if (c['archivado'] === true) return false;
  if (norm(c['estado']) !== "AMBULANCIA PROGRAMADA") return false;
  const ta = norm(c['tipo_ambulancia']);
  return ta.includes("TAB") || ta.includes("BASICA");
}

const LBL = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export function RiMultipleDialog({
  open,
  onOpenChange,
  casos,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  casos: CasoRI[];
}) {
  const qc = useQueryClient();
  const [empresa, setEmpresa] = useState("");
  const [sel, setSel] = useState<string[]>([]);
  const [sesionId, setSesionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [avisado, setAvisado] = useState(false);

  const elegibles = useMemo(() => casos.filter(esElegibleTrasladoMultiple), [casos]);
  const ids = useMemo(() => elegibles.map((c) => String(c['id'])), [elegibles]);

  // Empresa de ambulancia coordinada en la PROGRAMACIÓN de cada caso.
  const empresas = useQuery({
    queryKey: ["ri-multiple-empresas", ids.join(",")],
    enabled: open && ids.length > 0,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data } = await supabase
        .from("seguimientos")
        .select("caso_id, tipo_seguimiento, detalles, created_at")
        .eq("tipo_caso", "referencia_interna")
        .in("caso_id", ids)
        .order("created_at", { ascending: false });
      const out: Record<string, string> = {};
      for (const s of (data ?? []) as {
        caso_id: string;
        tipo_seguimiento: string | null;
        detalles: Record<string, unknown> | null;
      }[]) {
        if (out[s.caso_id]) continue;
        if (!norm(s.tipo_seguimiento).startsWith("CONFIRMACION DE PROGRAMACION")) continue;
        const emp = (s.detalles?.['empresa_ambulancia_nombre'] ?? "").toString().trim();
        if (emp) out[s.caso_id] = emp.toUpperCase();
      }
      return out;
    },
  });

  const empresaDe = (id: string) => empresas.data?.[id] ?? "";

  const opcionesEmpresa = useMemo(() => {
    const s = new Set<string>();
    for (const id of ids) {
      const e = empresaDe(id);
      if (e) s.add(e);
    }
    return Array.from(s).sort();
  }, [ids, empresas.data]);

  const candidatos = useMemo(
    () => elegibles.filter((c) => empresaDe(String(c['id'])) === empresa),
    [elegibles, empresa, empresas.data],
  );

  useEffect(() => {
    if (!open) {
      setEmpresa("");
      setSel([]);
      setSesionId(null);
      setToken(null);
      setQrUrl(null);
      setAvisado(false);
    }
  }, [open]);

  useEffect(() => {
    setSel([]);
  }, [empresa]);

  // Vigila el estado de la sesión hasta que se firme.
  const sesion = useQuery({
    queryKey: ["ri-multiple-firma", sesionId],
    enabled: !!sesionId,
    refetchInterval: (q) => {
      const d = q.state.data as { estado?: string } | undefined;
      return d && d.estado !== "PENDIENTE" ? false : 5000;
    },
    queryFn: async () => {
      const { data } = await supabase
        .from("entrega_firmas")
        .select("id, estado, firmado_at, codigo_verificacion, firmante_nombre")
        .eq("id", sesionId!)
        .maybeSingle();
      return data as {
        id: string;
        estado: string;
        firmado_at: string | null;
        codigo_verificacion: string | null;
        firmante_nombre: string | null;
      } | null;
    },
  });

  const firmada = sesion.data?.estado === "FIRMADA";

  useEffect(() => {
    if (firmada && !avisado) {
      setAvisado(true);
      qc.invalidateQueries({ queryKey: ["referencia-interna"] });
      qc.invalidateQueries({ queryKey: ["ult-gestiones"] });
      toast.success("Llegada confirmada y registrada en todos los pacientes del traslado");
    }
  }, [firmada, avisado, qc]);

  const toggle = (id: string) =>
    setSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const generar = async () => {
    if (sel.length < 2) {
      toast.error("Selecciona al menos dos pacientes del mismo traslado.");
      return;
    }
    setGenerando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data: perfil } = await supabase
        .from("profiles")
        .select("nombre")
        .eq("user_id", u.user?.id ?? "")
        .maybeSingle();

      const snapshot: SnapshotEntrega & { multiple_resumen: string; casos_total: number } = {
        paciente: `TRASLADO MÚLTIPLE TAB (${sel.length} pacientes)`,
        documento: "",
        ips_receptora: "CEDIM IPS",
        empresa_traslado: empresa,
        tipo_ambulancia: "TAB / AMBULANCIA BÁSICA",
        fecha_entrega: new Date().toLocaleString("es-CO", {
          dateStyle: "short",
          timeStyle: "short",
        }),
        documentos: [],
        multiple_resumen: `TRASLADO MÚLTIPLE TAB · ${sel.length} PACIENTES`,
        casos_total: sel.length,
      };

      const { id, token: tok } = await crearSesionFirmaMultipleRI({
        casoIds: sel,
        snapshot: snapshot as SnapshotEntrega,
        userId: u.user?.id ?? "",
        nombreUsuario: perfil?.nombre || u.user?.email || "—",
      });

      const url = urlFirma(tok);
      const QR = await import("qrcode");
      const dataUrl = await QR.default.toDataURL(url, { margin: 1, width: 320 });

      setSesionId(id);
      setToken(tok);
      setQrUrl(dataUrl);
      setAvisado(false);

      registrarAuditoria({
        data: {
          accion: "GENERAR_QR_FIRMA_MULTIPLE",
          modulo: "referencia_interna",
          tabla: "entrega_firmas",
          registroId: id,
          resultado: "exito",
        },
      }).catch(() => {});
      toast.success("QR generado (vence en 2 horas)");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No fue posible generar el QR");
    } finally {
      setGenerando(false);
    }
  };

  const anular = async () => {
    if (!sesionId) return;
    try {
      await anularSesion(sesionId);
      setSesionId(null);
      setToken(null);
      setQrUrl(null);
      toast.success("Enlace anulado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No fue posible anular");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold uppercase tracking-wide">
            Traslado múltiple TAB · firma única por QR
          </DialogTitle>
        </DialogHeader>

        {!qrUrl && (
          <div className="space-y-4">
            <p className="text-[12px] text-muted-foreground">
              Solo se listan casos en estado <b>AMBULANCIA PROGRAMADA</b> con ambulancia TAB /
              básica y empresa coordinada. La confirmación de llegada se registrará
              individualmente en cada caso al firmar.
            </p>

            <div className="space-y-1.5">
              <Label className={LBL}>Empresa de ambulancia *</Label>
              <Select value={empresa} onValueChange={setEmpresa}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccione la empresa coordinada…" />
                </SelectTrigger>
                <SelectContent>
                  {opcionesEmpresa.map((e) => (
                    <SelectItem key={e} value={e}>
                      {e}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {opcionesEmpresa.length === 0 && (
                <p className="text-[12px] text-muted-foreground">
                  No hay casos elegibles con empresa de ambulancia coordinada.
                </p>
              )}
            </div>

            {empresa && (
              <div className="space-y-2">
                <p className={LBL}>Pacientes del traslado ({sel.length} seleccionados)</p>
                <div className="space-y-1.5 rounded-md border p-2">
                  {candidatos.length === 0 && (
                    <p className="p-2 text-[12px] text-muted-foreground">
                      No hay pacientes elegibles para esta empresa.
                    </p>
                  )}
                  {candidatos.map((c) => {
                    const id = String(c['id']);
                    return (
                      <label
                        key={id}
                        className="flex cursor-pointer items-start gap-2 rounded-md p-1.5 text-sm hover:bg-muted/50"
                      >
                        <input
                          type="checkbox"
                          className="mt-1"
                          checked={sel.includes(id)}
                          onChange={() => toggle(id)}
                        />
                        <span>
                          <b>{String(c['paciente'] ?? "—")}</b>
                          <span className="text-muted-foreground">
                            {" · "}
                            {String(c['tipo_documento'] ?? "")} {String(c['documento'] ?? "—")}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {String(c['servicio'] ?? "—")} · {String(c['tipo_ambulancia'] ?? "—")}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {qrUrl && !firmada && (
          <div className="space-y-3">
            <div className="flex flex-col items-center gap-2 rounded-md bg-white p-3">
              <img src={qrUrl} alt="QR de firma" className="h-52 w-52" />
              {sesion.data?.codigo_verificacion && (
                <p className="font-mono text-xs text-muted-foreground">
                  Cód. verificación: <b>{sesion.data.codigo_verificacion}</b>
                </p>
              )}
            </div>
            <p className="text-center text-[12px] text-muted-foreground">
              {sel.length} pacientes · {empresa} · Esperando firma…
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  if (token) navigator.clipboard.writeText(urlFirma(token));
                  toast.success("Enlace copiado");
                }}
              >
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar enlace
              </Button>
              {token && (
                <a
                  href={urlFirma(token)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center rounded-md border px-2.5 py-1 text-xs hover:bg-muted"
                >
                  <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Abrir
                </a>
              )}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={anular}
                className="text-destructive"
              >
                <Ban className="mr-1.5 h-3.5 w-3.5" /> Anular
              </Button>
            </div>
          </div>
        )}

        {firmada && (
          <div className="space-y-1.5 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4" /> Llegada confirmada
            </div>
            <p className="text-xs">
              Se registró la confirmación de llegada en los {sel.length} casos del traslado.
            </p>
            {sesion.data?.codigo_verificacion && (
              <p className="font-mono text-xs">
                Cód. verificación: {sesion.data.codigo_verificacion}
              </p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
          {!qrUrl && (
            <Button type="button" onClick={generar} disabled={generando || sel.length < 2}>
              {generando ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <QrCode className="mr-2 h-4 w-4" />
              )}
              Generar QR de firma
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
