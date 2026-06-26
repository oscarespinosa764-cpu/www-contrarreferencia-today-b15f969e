import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Copy,
  Plus,
  X,
  QrCode,
  FileText,
  ListChecks,
  Ban,
  RefreshCw,
  Download,
  Loader2,
  CheckCircle2,
} from "lucide-react";
import {
  DOCUMENTOS_DEFAULT,
  crearSesionFirma,
  anularSesion,
  urlFirma,
  generarPlantillaIndigoEntrega,
  type DocItem,
  type SnapshotEntrega,
} from "@/lib/entrega-documental";
import {
  descargarPortadaPDF,
  descargarChecklistPDF,
  descargarFirmadoPDF,
  type EntregaDatos,
} from "@/lib/entrega-firma-pdf";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  casoId: string;
  tipoCaso: string;
  paciente: string;
  documento?: string | null;
  ipsReceptora?: string | null;
  empresaTraslado?: string | null;
};

type SesionRow = {
  id: string;
  estado: string;
  expira_at: string;
  firmante_nombre: string | null;
  firmante_cargo: string | null;
  firmante_empresa: string | null;
  firmante_documento: string | null;
  firmante_telefono: string | null;
  firma_data: string | null;
  firmado_at: string | null;
  codigo_verificacion: string | null;
  pdf_hash: string | null;
};

export function EntregaDocumentalDialog({
  open,
  onOpenChange,
  casoId,
  tipoCaso,
  paciente,
  documento,
  ipsReceptora,
  empresaTraslado,
}: Props) {
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [nuevoDoc, setNuevoDoc] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [ips, setIps] = useState("");
  const [fecha, setFecha] = useState("");
  const [sesionId, setSesionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDocs(DOCUMENTOS_DEFAULT.map((label) => ({ label, marcado: true })));
    setEmpresa(empresaTraslado ?? "");
    setIps(ipsReceptora ?? "");
    setFecha(new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }));
    setSesionId(null);
    setToken(null);
    setQrUrl(null);
  }, [open, empresaTraslado, ipsReceptora]);

  const snapshot = useMemo<SnapshotEntrega>(
    () => ({
      paciente,
      documento: documento ?? "",
      ips_receptora: ips,
      empresa_traslado: empresa,
      fecha_entrega: fecha,
      documentos: docs,
      caso_ref: documento ?? casoId,
    }),
    [paciente, documento, ips, empresa, fecha, docs, casoId],
  );

  const datosPDF: EntregaDatos = snapshot;

  // Estado de la sesión en vivo (polling ligero solo mientras hay QR activo).
  const sesion = useQuery({
    queryKey: ["entrega-firma-estado", sesionId],
    enabled: !!sesionId,
    refetchInterval: (q) => {
      const d = q.state.data as SesionRow | undefined;
      return d && d.estado !== "PENDIENTE" ? false : 6000;
    },
    queryFn: async (): Promise<SesionRow | null> => {
      const { data } = await supabase
        .from("entrega_firmas")
        .select(
          "id, estado, expira_at, firmante_nombre, firmante_cargo, firmante_empresa, firmante_documento, firmante_telefono, firma_data, firmado_at, codigo_verificacion, pdf_hash",
        )
        .eq("id", sesionId!)
        .maybeSingle();
      return (data as SesionRow) ?? null;
    },
  });

  const estado = sesion.data?.estado;
  const firmada = estado === "FIRMADA";

  const toggleDoc = (i: number) =>
    setDocs((p) => p.map((d, idx) => (idx === i ? { ...d, marcado: !d.marcado } : d)));
  const quitarDoc = (i: number) => setDocs((p) => p.filter((_, idx) => idx !== i));
  const agregarDoc = () => {
    const v = nuevoDoc.trim();
    if (!v) return;
    setDocs((p) => [...p, { label: v, marcado: true }]);
    setNuevoDoc("");
  };

  const copiarIndigo = (conFirma = false) => {
    const f =
      conFirma && sesion.data
        ? {
            nombre: sesion.data.firmante_nombre ?? "",
            cargo: sesion.data.firmante_cargo ?? "",
            empresa: sesion.data.firmante_empresa ?? "",
            documento: sesion.data.firmante_documento ?? "",
            firmado_at: sesion.data.firmado_at ?? "",
            codigo: sesion.data.codigo_verificacion ?? "",
          }
        : undefined;
    navigator.clipboard.writeText(generarPlantillaIndigoEntrega(snapshot, f));
    toast.success("Plantilla Índigo copiada");
  };

  const generarQR = async () => {
    setGenerando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data: perfil } = await supabase
        .from("profiles")
        .select("nombre")
        .eq("user_id", u.user?.id ?? "")
        .maybeSingle();

      const { id, token: tok } = await crearSesionFirma({
        casoId,
        tipoCaso,
        snapshot,
        userId: u.user?.id ?? "",
        nombreUsuario: perfil?.nombre || u.user?.email || "—",
      });

      const url = urlFirma(tok);
      const QR = await import("qrcode");
      const dataUrl = await QR.default.toDataURL(url, { margin: 1, width: 320 });

      setSesionId(id);
      setToken(tok);
      setQrUrl(dataUrl);

      registrarAuditoria({
        data: {
          accion: "GENERAR_QR_FIRMA",
          modulo: "remisiones salientes",
          tabla: "entrega_firmas",
          registroId: id,
          resultado: "exito",
        },
      }).catch(() => {});
      toast.success("QR de firma generado (vence en 2 horas)");
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
      registrarAuditoria({
        data: {
          accion: "ANULAR_QR_FIRMA",
          modulo: "remisiones salientes",
          tabla: "entrega_firmas",
          registroId: sesionId,
          resultado: "exito",
        },
      }).catch(() => {});
      setQrUrl(null);
      setToken(null);
      setSesionId(null);
      toast.success("Enlace anulado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No fue posible anular");
    }
  };

  const regenerar = async () => {
    if (sesionId) await anularSesion(sesionId).catch(() => {});
    await generarQR();
    registrarAuditoria({
      data: {
        accion: "REGENERAR_QR_FIRMA",
        modulo: "remisiones salientes",
        tabla: "entrega_firmas",
        resultado: "exito",
      },
    }).catch(() => {});
  };

  const descargarFirmado = async () => {
    const d = sesion.data;
    if (!d || !d.firma_data) return;
    await descargarFirmadoPDF(datosPDF, {
      nombre: d.firmante_nombre ?? "",
      cargo: d.firmante_cargo ?? "",
      empresa: d.firmante_empresa ?? "",
      documento: d.firmante_documento ?? "",
      telefono: d.firmante_telefono ?? "",
      firma_data: d.firma_data,
      firmado_at: d.firmado_at ?? "",
      codigo_verificacion: d.codigo_verificacion ?? "",
      pdf_hash: d.pdf_hash ?? undefined,
    });
    registrarAuditoria({
      data: {
        accion: "DESCARGAR_PDF_FIRMADO",
        modulo: "remisiones salientes",
        tabla: "entrega_firmas",
        registroId: d.id,
        resultado: "exito",
      },
    }).catch(() => {});
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Llegada de ambulancia · Entrega documental</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Datos base */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Empresa de traslado</Label>
              <Input value={empresa} onChange={(e) => setEmpresa(e.target.value)} disabled={!!sesionId} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">IPS receptora</Label>
              <Input value={ips} onChange={(e) => setIps(e.target.value)} disabled={!!sesionId} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Fecha/hora de entrega</Label>
              <Input value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!!sesionId} />
            </div>
          </div>

          {/* Checklist documental */}
          <div className="space-y-2">
            <Label className="text-xs font-semibold uppercase text-muted-foreground">
              Lista de chequeo documental
            </Label>
            <div className="space-y-1.5 rounded-md border p-2">
              {docs.map((d, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={d.marcado}
                    onCheckedChange={() => toggleDoc(i)}
                    disabled={!!sesionId}
                  />
                  <span className="flex-1">{d.label}</span>
                  {!sesionId && (
                    <button onClick={() => quitarDoc(i)} className="text-muted-foreground hover:text-destructive">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {!sesionId && (
                <div className="flex items-center gap-2 pt-1">
                  <Input
                    value={nuevoDoc}
                    onChange={(e) => setNuevoDoc(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), agregarDoc())}
                    placeholder="Agregar documento…"
                    className="h-8 text-sm"
                  />
                  <Button type="button" size="sm" variant="outline" onClick={agregarDoc}>
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Acciones de generación bajo demanda */}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => copiarIndigo(false)}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Plantilla Índigo
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => descargarPortadaPDF(datosPDF)}>
              <FileText className="mr-1.5 h-3.5 w-3.5" /> Portada PDF
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => descargarChecklistPDF(datosPDF)}>
              <ListChecks className="mr-1.5 h-3.5 w-3.5" /> Checklist PDF
            </Button>
          </div>

          {/* QR */}
          {!sesionId ? (
            <Button type="button" className="w-full" onClick={generarQR} disabled={generando}>
              {generando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
              Generar QR de firma
            </Button>
          ) : firmada ? (
            <div className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
              <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-5 w-5" />
                <span className="font-semibold">Entrega firmada</span>
              </div>
              <div className="space-y-0.5 text-sm">
                <p><b>Firmante:</b> {sesion.data?.firmante_nombre} — {sesion.data?.firmante_cargo}</p>
                <p><b>Empresa:</b> {sesion.data?.firmante_empresa || "—"}</p>
                <p><b>Código:</b> {sesion.data?.codigo_verificacion}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={descargarFirmado}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> PDF firmado
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => copiarIndigo(true)}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar para Índigo
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-lg border p-4 text-center">
              {qrUrl && <img src={qrUrl} alt="QR de firma" className="mx-auto h-48 w-48" />}
              <p className="text-xs text-muted-foreground">
                Escanee el QR con el celular del tripulante. Vence en 2 horas · uso único.
              </p>
              <div className="flex justify-center gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => token && (navigator.clipboard.writeText(urlFirma(token)), toast.success("Enlace copiado"))}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar enlace
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={regenerar}>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Regenerar
                </Button>
                <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={anular}>
                  <Ban className="mr-1.5 h-3.5 w-3.5" /> Anular
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
