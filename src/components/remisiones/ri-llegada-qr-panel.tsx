// Panel de firma por QR para "CONFIRMACIÓN DE LLEGADA DE AMBULANCIA" en
// Referencia Interna. Reutiliza la misma infraestructura de entrega_firmas
// (token hasheado, ruta pública /firma-entrega, código de verificación,
// vencimiento por 2h) sin duplicar backend.
//
// El QR permite que el personal externo confirme la llegada firmando desde su
// dispositivo. Al firmar, este panel auto-completa la fecha/hora oficial del
// seguimiento con el momento real de la firma.

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Copy, QrCode, Ban, RefreshCw, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import {
  crearSesionFirma,
  anularSesion,
  urlFirma,
  type SnapshotEntrega,
} from "@/lib/entrega-documental";

type SesionRow = {
  id: string;
  estado: string;
  expira_at: string;
  firmante_nombre: string | null;
  firmante_cargo: string | null;
  firmante_empresa: string | null;
  firmante_telefono: string | null;
  firmante_es_responsable: boolean | null;
  responsable_nombre: string | null;
  responsable_cargo: string | null;
  tipo_ambulancia: string | null;
  empresa_declarada: string | null;
  firmado_at: string | null;
  codigo_verificacion: string | null;
};

export type FirmaLlegadaInfo = {
  firmadoAtISO: string;
  codigo: string;
  firmante_nombre: string | null;
  firmante_cargo: string | null;
  firmante_telefono: string | null;
  firmante_es_responsable: boolean | null;
  responsable_nombre: string | null;
  responsable_cargo: string | null;
  empresa: string | null;
  tipo_ambulancia: string | null;
};

type Props = {
  casoId: string;
  paciente: string;
  documento?: string | null;
  unidadDestino?: string | null;
  radicadoCaso?: string | null;
  /** Se dispara una sola vez cuando el firmante remoto completa la firma. */
  onFirmada?: (info: FirmaLlegadaInfo) => void;
};

export function RiLlegadaQRPanel({ casoId, paciente, documento, unidadDestino, radicadoCaso, onFirmada }: Props) {
  const qc = useQueryClient();
  const [sesionId, setSesionId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [generando, setGenerando] = useState(false);
  const [notificado, setNotificado] = useState(false);

  const sesion = useQuery({
    queryKey: ["ri-firma-estado", sesionId],
    enabled: !!sesionId,
    refetchInterval: (q) => {
      const d = q.state.data as SesionRow | undefined;
      return d && d.estado !== "PENDIENTE" ? false : 5000;
    },
    queryFn: async (): Promise<SesionRow | null> => {
      const { data } = await supabase
        .from("entrega_firmas")
        .select(
          "id, estado, expira_at, firmante_nombre, firmante_cargo, firmante_empresa, firmante_telefono, firmante_es_responsable, responsable_nombre, responsable_cargo, tipo_ambulancia, empresa_declarada, firmado_at, codigo_verificacion",
        )
        .eq("id", sesionId!)
        .maybeSingle();
      return (data as unknown as SesionRow) ?? null;
    },
  });

  const estado = sesion.data?.estado;
  const firmada = estado === "FIRMADA";
  const vencida = estado === "VENCIDA";
  const anulada = estado === "ANULADA";

  useEffect(() => {
    if (firmada && sesion.data?.firmado_at && !notificado) {
      setNotificado(true);
      const d = sesion.data;
      onFirmada?.({
        firmadoAtISO: d.firmado_at!,
        codigo: d.codigo_verificacion ?? "",
        firmante_nombre: d.firmante_nombre,
        firmante_cargo: d.firmante_cargo,
        firmante_telefono: d.firmante_telefono,
        firmante_es_responsable: d.firmante_es_responsable,
        responsable_nombre: d.responsable_nombre,
        responsable_cargo: d.responsable_cargo,
        empresa: d.empresa_declarada || d.firmante_empresa,
        tipo_ambulancia: d.tipo_ambulancia,
      });
      qc.invalidateQueries({ queryKey: ["referencia_interna"] });
    }
  }, [firmada, sesion.data, notificado, onFirmada, qc]);
      qc.invalidateQueries({ queryKey: ["referencia_interna"] });
    }
  }, [firmada, sesion.data, notificado, onFirmada, qc]);

  const generar = async () => {
    setGenerando(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const { data: perfil } = await supabase
        .from("profiles")
        .select("nombre")
        .eq("user_id", u.user?.id ?? "")
        .maybeSingle();

      const snapshot: SnapshotEntrega = {
        paciente,
        documento: documento ?? "",
        ips_receptora: unidadDestino ?? "",
        empresa_traslado: "",
        fecha_entrega: new Date().toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }),
        documentos: [],
        caso_ref: radicadoCaso ?? documento ?? casoId,
        origen: null,
      };

      const { id, token: tok } = await crearSesionFirma({
        casoId,
        tipoCaso: "referencia_interna",
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
      setNotificado(false);

      registrarAuditoria({
        data: {
          accion: "GENERAR_QR_FIRMA",
          modulo: "referencia_interna",
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
          modulo: "referencia_interna",
          tabla: "entrega_firmas",
          registroId: sesionId,
          resultado: "exito",
        },
      }).catch(() => {});
      setQrUrl(null);
      setToken(null);
      setSesionId(null);
      setNotificado(false);
      toast.success("Enlace anulado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No fue posible anular");
    }
  };

  const regenerar = async () => {
    if (sesionId) await anularSesion(sesionId).catch(() => {});
    setSesionId(null);
    setToken(null);
    setQrUrl(null);
    setNotificado(false);
    await generar();
  };

  const copiarUrl = () => {
    if (!token) return;
    navigator.clipboard.writeText(urlFirma(token));
    toast.success("Enlace copiado");
  };

  const puedeGenerar = !sesionId || vencida || anulada;

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <QrCode className="h-4 w-4 text-primary" />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
          Firma por QR · Confirmación de llegada
        </p>
      </div>

      {!qrUrl && !firmada && (
        <>
          <p className="text-[12px] text-muted-foreground">
            Genera un QR para que el personal receptor confirme la llegada firmando desde su celular.
            La fecha y hora oficiales se tomarán del momento en que se registre la firma.
          </p>
          <Button size="sm" onClick={generar} disabled={generando}>
            {generando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
            Generar QR de firma
          </Button>
        </>
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
          {vencida && (
            <p className="text-[12px] font-medium text-amber-600">
              El enlace venció. Genere uno nuevo.
            </p>
          )}
          {anulada && (
            <p className="text-[12px] font-medium text-destructive">
              El enlace fue anulado.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={copiarUrl}>
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
            <Button type="button" size="sm" variant="ghost" onClick={regenerar} disabled={generando}>
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Regenerar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={anular} className="text-destructive">
              <Ban className="mr-1.5 h-3.5 w-3.5" /> Anular
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Esperando firma… Se actualiza automáticamente.
          </p>
        </div>
      )}

      {firmada && sesion.data && (
        <div className="space-y-1.5 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200">
          <div className="flex items-center gap-2 font-semibold">
            <CheckCircle2 className="h-4 w-4" /> Llegada confirmada por firma
          </div>
          {sesion.data.firmante_nombre && (
            <p className="text-xs">
              Firmante: <b>{sesion.data.firmante_nombre}</b>
              {sesion.data.firmante_cargo ? ` · ${sesion.data.firmante_cargo}` : ""}
            </p>
          )}
          {sesion.data.firmado_at && (
            <p className="text-xs">
              Fecha/hora oficial:{" "}
              <b>{new Date(sesion.data.firmado_at).toLocaleString("es-CO")}</b>
            </p>
          )}
          {sesion.data.codigo_verificacion && (
            <p className="font-mono text-xs">Cód. verificación: {sesion.data.codigo_verificacion}</p>
          )}
        </div>
      )}
    </div>
  );
}
