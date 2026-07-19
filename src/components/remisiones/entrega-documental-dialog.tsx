import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Copy,
  QrCode,
  FileText,
  Ban,
  RefreshCw,
  Download,
  Loader2,
  CheckCircle2,
  CheckSquare,
  Eraser,
  Lock,
} from "lucide-react";
import {
  ORIGENES_DOC,
  documentosPorOrigen,
  fetchDocumentosPorOrigen,
  crearSesionFirma,
  anularSesion,
  urlFirma,
  generarPlantillaIndigoCorta,
  type DocItem,
  type OrigenDoc,
  type SnapshotEntrega,
} from "@/lib/entrega-documental";
import {
  descargarPortadaPDF,
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
  tipoDocumento?: string | null;
  cie10?: string | null;
  ipsReceptora?: string | null;
  empresaTraslado?: string | null;
  especialidad?: string | null;
  entidadPago?: string | null;
  tipoAmbulancia?: string | null;
  quienAcepta?: string | null;
  cargoAcepta?: string | null;
};

type SesionRow = {
  id: string;
  estado: string;
  expira_at: string;
  firmante_nombre: string | null;
  firmante_cargo: string | null;
  firmante_empresa: string | null;
  firmante_telefono: string | null;
  firma_data: string | null;
  firmado_at: string | null;
  codigo_verificacion: string | null;
  pdf_hash: string | null;
  responsable_nombre: string | null;
  responsable_cargo: string | null;
  firmante_es_responsable: boolean | null;
  tipo_ambulancia: string | null;
  empresa_declarada: string | null;
  empresa_declarada_motivo: string | null;
};

export function EntregaDocumentalDialog({
  open,
  onOpenChange,
  casoId,
  tipoCaso,
  paciente,
  documento,
  tipoDocumento,
  cie10,
  ipsReceptora,
  empresaTraslado,
  especialidad,
  entidadPago,
  tipoAmbulancia,
  quienAcepta,
  cargoAcepta,
}: Props) {
  const [origen, setOrigen] = useState<OrigenDoc | "">("");
  const [docs, setDocs] = useState<DocItem[]>([]);
  // Trazabilidad: si viene de la asignación previa, se marca como readonly.
  const empresaDeTrazabilidad = !!(empresaTraslado ?? "").trim();
  const ipsDeTrazabilidad = !!(ipsReceptora ?? "").trim();
  const [empresa, setEmpresa] = useState("");
  const [ips, setIps] = useState("");
  const [fecha, setFecha] = useState("");
  // Datos operativos autollenados desde el flujo (editables si faltan) — Parte 1.3/1.4.
  const [quienAceptaS, setQuienAceptaS] = useState("");
  const [cargoAceptaS, setCargoAceptaS] = useState("");
  const [tripulanteS, setTripulanteS] = useState("");
  const [cargoTripulanteS, setCargoTripulanteS] = useState("");
  const [sesionId, setSesionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [cargandoDocs, setCargandoDocs] = useState(false);
  const [indigoCorta, setIndigoCorta] = useState("");

  // Autollenado con datos previos del caso (Parte 1.3/1.4).
  useEffect(() => {
    if (!open) return;
    setOrigen("");
    setDocs([]);
    setEmpresa((empresaTraslado ?? "").toUpperCase());
    setIps((ipsReceptora ?? "").toUpperCase());
    setQuienAceptaS((quienAcepta ?? "").toUpperCase());
    setCargoAceptaS((cargoAcepta ?? "").toUpperCase());
    setTripulanteS("");
    setCargoTripulanteS("");
    setFecha(new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }));
    setSesionId(null);
    setToken(null);
    setQrUrl(null);
    setIndigoCorta("");
  }, [open, empresaTraslado, ipsReceptora, quienAcepta, cargoAcepta]);

  // Al elegir origen, cargar checklist desde el catálogo administrable (Parte 12.3).
  // El catálogo es editable sin código en: Catálogo → Documentos de entrega.
  const cambiarOrigen = async (v: OrigenDoc) => {
    setOrigen(v);
    // Base inmediata por código (respuesta instantánea) y luego se sincroniza con el catálogo.
    setDocs(documentosPorOrigen(v).map((label) => ({ label, marcado: true })));
    setCargandoDocs(true);
    try {
      const labels = await fetchDocumentosPorOrigen(v);
      setDocs(labels.map((label) => ({ label, marcado: true })));
    } finally {
      setCargandoDocs(false);
    }
  };


  const snapshot = useMemo<SnapshotEntrega>(
    () => ({
      paciente,
      documento: documento ?? "",
      ips_receptora: ips,
      empresa_traslado: empresa,
      fecha_entrega: fecha,
      documentos: docs,
      caso_ref: documento ?? casoId,
      origen: origen || null,
      especialidad: especialidad ?? undefined,
      entidad_pago: entidadPago ?? undefined,
      tipo_ambulancia: tipoAmbulancia ?? undefined,
      quien_acepta: quienAceptaS || undefined,
      cargo_acepta: cargoAceptaS || undefined,
    }),
    [
      paciente,
      documento,
      ips,
      empresa,
      fecha,
      docs,
      casoId,
      origen,
      especialidad,
      entidadPago,
      tipoAmbulancia,
      quienAceptaS,
      cargoAceptaS,
    ],
  );

  const datosPDF: EntregaDatos = useMemo(
    () => ({
      paciente,
      documento: documento ?? "",
      tipo_documento: tipoDocumento ?? undefined,
      cie10: cie10 ?? undefined,
      ips_receptora: ips,
      empresa_traslado: empresa,
      fecha_entrega: fecha,
      documentos: docs,
      caso_ref: documento ?? casoId,
      origen: origen || undefined,
      especialidad: especialidad ?? undefined,
      entidad_pago: entidadPago ?? undefined,
      entidad_receptora: ips,
      tipo_ambulancia: tipoAmbulancia ?? undefined,
      quien_acepta: quienAceptaS || undefined,
      cargo_acepta: cargoAceptaS || undefined,
      tripulante: tripulanteS || undefined,
      cargo_tripulante: cargoTripulanteS || undefined,
      modalidad: "REMISIÓN",
    }),
    [
      paciente,
      documento,
      tipoDocumento,
      cie10,
      ips,
      empresa,
      fecha,
      docs,
      casoId,
      origen,
      especialidad,
      entidadPago,
      tipoAmbulancia,
      quienAceptaS,
      cargoAceptaS,
      tripulanteS,
      cargoTripulanteS,
    ],
  );

  // Validación previa: no generar la portada si faltan datos obligatorios (Parte 1.3).
  const generarPortada = () => {
    const faltantes: string[] = [];
    if (!empresa.trim()) faltantes.push("Empresa que traslada");
    if (!ips.trim()) faltantes.push("IPS receptora / Entidad receptora");
    if (!paciente?.trim()) faltantes.push("Nombre del paciente");
    if (!(documento ?? "").trim()) faltantes.push("Documento");
    if (!(entidadPago ?? "").trim()) faltantes.push("Entidad responsable del pago");
    if (faltantes.length > 0) {
      toast.error(`Faltan datos para generar la portada: ${faltantes.join(", ")}.`);
      return;
    }
    descargarPortadaPDF(datosPDF);
  };

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

  // Al confirmarse la firma, migrar datos del tripulante al modal y armar Índigo (Parte 7/14).
  useEffect(() => {
    if (firmada && sesion.data) {
      if (sesion.data.firmante_nombre && !tripulanteS)
        setTripulanteS(sesion.data.firmante_nombre.toUpperCase());
      if (sesion.data.firmante_cargo && !cargoTripulanteS)
        setCargoTripulanteS(sesion.data.firmante_cargo.toUpperCase());
      if (!indigoCorta) {
        setIndigoCorta(
          generarPlantillaIndigoCorta(snapshot, {
            nombre: sesion.data.firmante_nombre ?? "",
            cargo: sesion.data.firmante_cargo ?? "",
          }),
        );
      }
    }
  }, [firmada, sesion.data, indigoCorta, snapshot, tripulanteS, cargoTripulanteS]);

  const toggleDoc = (i: number) =>
    setDocs((p) => p.map((d, idx) => (idx === i ? { ...d, marcado: !d.marcado } : d)));
  const marcarTodos = () => setDocs((p) => p.map((d) => ({ ...d, marcado: true })));
  const limpiarMarcas = () => setDocs((p) => p.map((d) => ({ ...d, marcado: false })));

  const copiarIndigoCorta = () => {
    navigator.clipboard.writeText(indigoCorta || generarPlantillaIndigoCorta(snapshot));
    toast.success("Plantilla Índigo copiada");
  };

  const generarQR = async () => {
    if (!origen) return toast.error("Selecciona el tipo de origen / responsable documental");
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
          {/* Datos base (autollenados, editables) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                Empresa de traslado
                {empresaDeTrazabilidad && <Lock className="h-3 w-3 text-muted-foreground" />}
              </Label>
              <Input
                uppercase
                value={empresa}
                onChange={(e) => setEmpresa(e.target.value)}
                disabled={!!sesionId || empresaDeTrazabilidad}
                placeholder={!empresaDeTrazabilidad ? "NO HAY EMPRESA DE TRASLADO ASIGNADA…" : undefined}
              />
              {!empresaDeTrazabilidad && (
                <p className="text-[10.5px] text-amber-600">
                  Sin empresa en la trazabilidad. Registre la asignación desde el seguimiento del caso.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1">
                IPS receptora
                {ipsDeTrazabilidad && <Lock className="h-3 w-3 text-muted-foreground" />}
              </Label>
              <Input
                uppercase
                value={ips}
                onChange={(e) => setIps(e.target.value)}
                disabled={!!sesionId || ipsDeTrazabilidad}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nombre de quien acepta</Label>
              <Input uppercase value={quienAceptaS} onChange={(e) => setQuienAceptaS(e.target.value)} disabled={!!sesionId} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cargo de quien acepta</Label>
              <Input uppercase value={cargoAceptaS} onChange={(e) => setCargoAceptaS(e.target.value)} disabled={!!sesionId} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Fecha/hora de entrega</Label>
              <Input value={fecha} onChange={(e) => setFecha(e.target.value)} disabled={!!sesionId} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Tipo de origen / responsable documental</Label>
              <Select
                value={origen}
                onValueChange={(v) => cambiarOrigen(v as OrigenDoc)}
                disabled={!!sesionId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona: EPS / SOAT / ADRES / ARL / Particular" />
                </SelectTrigger>
                <SelectContent>
                  {ORIGENES_DOC.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Checklist documental (según origen) */}
          {origen ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">
                  Lista de chequeo · {origen}
                  {cargandoDocs && (
                    <Loader2 className="ml-1.5 inline h-3 w-3 animate-spin align-[-2px]" />
                  )}
                </Label>

                {!sesionId && (
                  <div className="flex gap-1.5">
                    <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={marcarTodos}>
                      <CheckSquare className="mr-1 h-3 w-3" /> Marcar todos
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="h-6 px-2 text-[11px]" onClick={limpiarMarcas}>
                      <Eraser className="mr-1 h-3 w-3" /> Limpiar
                    </Button>
                  </div>
                )}
              </div>
              <div className="space-y-1.5 rounded-md border p-2">
                {docs.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={d.marcado}
                      onCheckedChange={() => toggleDoc(i)}
                      disabled={!!sesionId}
                    />
                    <span className="flex-1">{d.label}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10.5px] text-muted-foreground">
                Los ítems se administran desde Control de Mando → Listas de chequeo.
              </p>
            </div>
          ) : (
            <p className="rounded-md border border-dashed p-3 text-xs text-muted-foreground">
              Selecciona el tipo de origen para cargar la lista de chequeo institucional.
            </p>
          )}

          {/* PASO 1 — Antes de la firma: solo Generar QR (Portada y Acta aparecen tras la firma) */}
          {!sesionId ? (
            <div className="space-y-2">
              {(!quienAceptaS.trim() || !cargoAceptaS.trim()) && (
                <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                  Complete el NOMBRE y el CARGO de quien acepta la documentación para poder generar el QR.
                </p>
              )}
              <Button
                type="button"
                className="w-full"
                onClick={generarQR}
                disabled={
                  generando ||
                  !origen ||
                  !empresa.trim() ||
                  !ips.trim() ||
                  !quienAceptaS.trim() ||
                  !cargoAceptaS.trim()
                }
              >
                {generando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                Generar QR de firma
              </Button>
            </div>
          ) : firmada ? (
            /* PASO 3 — Después de la firma (Parte 13.2) */
            <div className="space-y-4">
              {/* Bloque 1 · Datos del firmante */}
              <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 dark:border-emerald-900 dark:bg-emerald-950/30">
                <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                  <CheckCircle2 className="h-5 w-5" />
                  <span className="font-semibold">Entrega firmada</span>
                </div>
                <div className="space-y-0.5 text-sm">
                  <p><b>Nombre:</b> {sesion.data?.firmante_nombre || "—"}</p>
                  <p><b>Cargo:</b> {sesion.data?.firmante_cargo || "—"}</p>
                  <p><b>Empresa:</b> {sesion.data?.firmante_empresa || "—"}</p>
                  <p><b>Documento/ID:</b> {sesion.data?.firmante_documento || "—"}</p>
                  <p>
                    <b>Fecha/hora de firma:</b>{" "}
                    {sesion.data?.firmado_at
                      ? new Date(sesion.data.firmado_at).toLocaleString("es-CO")
                      : "—"}
                  </p>
                  <p><b>Código:</b> {sesion.data?.codigo_verificacion || "—"}</p>
                </div>
              </div>

              {/* Bloque 2 · Plantilla Índigo corta (editable + copiar) */}
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold uppercase text-muted-foreground">
                  Plantilla Índigo corta
                </Label>
                <Textarea
                  value={indigoCorta}
                  onChange={(e) => setIndigoCorta(e.target.value)}
                  rows={3}
                  className="text-sm"
                />
                <Button type="button" size="sm" variant="outline" onClick={copiarIndigoCorta}>
                  <Copy className="mr-1.5 h-3.5 w-3.5" /> Copiar para Índigo
                </Button>
              </div>

              {/* Bloque 3 · Portada + Checklist PDF firmado */}
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button type="button" size="sm" variant="outline" onClick={generarPortada}>
                  <FileText className="mr-1.5 h-3.5 w-3.5" /> Portada PDF
                </Button>
                <Button type="button" size="sm" onClick={descargarFirmado}>
                  <Download className="mr-1.5 h-3.5 w-3.5" /> Acta firmada PDF
                </Button>
              </div>

              {/* Bloque 4 · Cerrar */}
              <Button type="button" size="sm" variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
                Cerrar
              </Button>
            </div>
          ) : (
            /* PASO 2 — QR activo, esperando firma */
            <div className="space-y-3 rounded-lg border p-4 text-center">
              {qrUrl && <img src={qrUrl} alt="QR de firma" className="mx-auto h-48 w-48" />}
              <p className="text-xs text-muted-foreground">
                Escanee el QR con el celular del tripulante. Vence en 2 horas · uso único.
              </p>
              <div className="flex justify-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    token && (navigator.clipboard.writeText(urlFirma(token)), toast.success("Enlace copiado"))
                  }
                >
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
