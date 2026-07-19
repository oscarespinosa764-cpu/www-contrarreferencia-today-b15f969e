import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { obtenerSesionFirma, firmarEntrega } from "@/lib/entrega-firma.functions";
import { SignaturePad, type SignaturePadHandle } from "@/components/cuadro-turno/signature-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, ShieldCheck, CircleAlert, CheckCircle2 } from "lucide-react";

const TEXTO_ACEPTACION =
  "Declaro que recibo la documentación relacionada en la lista de chequeo para el traslado " +
  "del paciente y que la información registrada corresponde a la entrega realizada.";

const TIPOS_AMBULANCIA = ["BÁSICA", "MEDICALIZADA", "AVANZADA (TAM)"];

export const Route = createFileRoute("/firma-entrega")({
  validateSearch: (s: Record<string, unknown>) =>
    z.object({ t: z.string().optional() }).parse(s),
  component: FirmaEntregaPage,
  head: () => ({
    meta: [
      { title: "Firma de entrega documental — CEDIM IPS" },
      { name: "robots", content: "noindex, nofollow" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
    ],
  }),
});

type Snap = {
  paciente_iniciales?: string;
  documento_enmascarado?: string;
  ips_receptora?: string;
  empresa_traslado?: string;
  tipo_ambulancia?: string;
  fecha_entrega?: string;
  documentos?: string[];
};

function Aviso({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="mx-auto mt-16 max-w-md rounded-xl border bg-card p-6 text-center shadow-sm">
      <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <h1 className="text-lg font-bold text-foreground">{title}</h1>
      <p className="mt-2 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

function FirmaEntregaPage() {
  const { t } = Route.useSearch();
  const obtener = useServerFn(obtenerSesionFirma);
  const firmar = useServerFn(firmarEntrega);
  const padRef = useRef<SignaturePadHandle>(null);

  const [respNombre, setRespNombre] = useState("");
  const [respCargo, setRespCargo] = useState("");
  const [firmanteEsResp, setFirmanteEsResp] = useState<"si" | "no">("si");
  const [firmNombre, setFirmNombre] = useState("");
  const [firmCargo, setFirmCargo] = useState("");
  const [tipoAmb, setTipoAmb] = useState("");
  const [telefono, setTelefono] = useState("");
  const [reportarOtra, setReportarOtra] = useState(false);
  const [empresaOtra, setEmpresaOtra] = useState("");
  const [motivoOtra, setMotivoOtra] = useState("");
  const [acepta, setAcepta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState("");
  const [firmado, setFirmado] = useState<{ codigo: string } | null>(null);

  const sesion = useQuery({
    queryKey: ["firma-entrega", t],
    enabled: !!t,
    queryFn: () => obtener({ data: { token: t! } }),
    staleTime: 0,
  });

  const snap = (sesion.data?.snapshot ?? {}) as Snap;
  const empresaSnap = (snap.empresa_traslado || "").toUpperCase();

  useEffect(() => {
    if (snap.tipo_ambulancia && !tipoAmb) setTipoAmb(snap.tipo_ambulancia.toUpperCase());
  }, [snap.tipo_ambulancia, tipoAmb]);

  if (!t) {
    return (
      <Aviso
        icon={<CircleAlert className="h-6 w-6 text-destructive" />}
        title="Enlace no válido"
        text="El enlace de firma no contiene un token válido. Solicite generar uno nuevo."
      />
    );
  }

  if (sesion.isLoading) {
    return (
      <div className="mt-24 flex items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" /> Cargando…
      </div>
    );
  }

  const estado = sesion.data?.estado;
  if (estado === "NO_EXISTE")
    return <Aviso icon={<CircleAlert className="h-6 w-6 text-destructive" />} title="Enlace no válido" text="No encontramos esta entrega. Solicite generar un nuevo enlace de firma." />;
  if (estado === "VENCIDA")
    return <Aviso icon={<CircleAlert className="h-6 w-6 text-amber-600" />} title="Enlace vencido" text="Este enlace de firma ha vencido. Solicite generar uno nuevo." />;
  if (estado === "ANULADA")
    return <Aviso icon={<CircleAlert className="h-6 w-6 text-destructive" />} title="Enlace anulado" text="Este enlace de firma fue anulado. Solicite generar uno nuevo." />;
  if (estado === "FIRMADA" || firmado)
    return (
      <Aviso
        icon={<CheckCircle2 className="h-6 w-6 text-emerald-600" />}
        title={firmado ? "¡Firma registrada!" : "Esta entrega ya fue firmada."}
        text={
          firmado
            ? `Su firma fue registrada correctamente. Código de verificación: ${firmado.codigo}.`
            : "La documentación de esta entrega ya cuenta con firma de recibido."
        }
      />
    );

  const docs = snap.documentos ?? [];

  const onSubmit = async () => {
    setError("");
    const rN = respNombre.trim().toUpperCase();
    const rC = respCargo.trim().toUpperCase();
    if (rN.length < 2) return setError("Indique el nombre del responsable.");
    if (rC.length < 2) return setError("Indique el cargo del responsable.");

    const esResp = firmanteEsResp === "si";
    const fN = (esResp ? rN : firmNombre.trim().toUpperCase());
    const fC = (esResp ? rC : firmCargo.trim().toUpperCase());
    if (!esResp && fN.length < 2) return setError("Indique el nombre del firmante.");
    if (!esResp && fC.length < 2) return setError("Indique el cargo del firmante.");

    if (!tipoAmb) return setError("Seleccione el tipo de ambulancia.");
    if (telefono.trim().length < 7) return setError("Indique un teléfono de contacto válido.");
    if (padRef.current?.isEmpty()) return setError("Debe firmar en la pantalla.");
    if (!acepta) return setError("Debe aceptar la declaración de recibido.");

    if (reportarOtra) {
      if (empresaOtra.trim().length < 2) return setError("Indique la empresa realmente presente.");
      if (motivoOtra.trim().length < 3) return setError("Indique el motivo del cambio de empresa.");
    }

    const empresaFinal = reportarOtra
      ? empresaOtra.trim().toUpperCase()
      : empresaSnap;

    const firma_data = padRef.current?.toDataURL() ?? "";

    setEnviando(true);
    try {
      const res = await firmar({
        data: {
          token: t!,
          responsable_nombre: rN,
          responsable_cargo: rC,
          firmante_es_responsable: esResp,
          firmante_nombre: fN,
          firmante_cargo: fC,
          firmante_empresa: empresaFinal,
          firmante_telefono: telefono.trim(),
          tipo_ambulancia: tipoAmb,
          empresa_declarada: reportarOtra ? empresaOtra.trim().toUpperCase() : "",
          empresa_declarada_motivo: reportarOtra ? motivoOtra.trim() : "",
          firma_data,
          aceptacion: true as const,
        },
      });
      if (res.ok) {
        setFirmado({ codigo: res.codigo_verificacion });
      } else {
        const msg: Record<string, string> = {
          VENCIDA: "Este enlace de firma ha vencido. Solicite generar uno nuevo.",
          FIRMADA: "Esta entrega ya fue firmada.",
          ANULADA: "Este enlace fue anulado. Solicite generar uno nuevo.",
          NO_EXISTE: "Enlace no válido. Solicite generar uno nuevo.",
          DATOS: "No fue posible registrar la firma. Intente de nuevo.",
        };
        setError(msg[res.error] ?? "No fue posible registrar la firma.");
      }
    } catch {
      setError("Ocurrió un error al enviar la firma. Intente de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 pb-16 pt-6">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">Firma de entrega documental</h1>
      </div>

      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <Dato k="Paciente (iniciales)" v={snap.paciente_iniciales} />
        <Dato k="Documento" v={snap.documento_enmascarado} />
        <Dato k="IPS receptora" v={snap.ips_receptora} />
        <Dato k="Empresa de traslado" v={empresaSnap || "—"} />
        <Dato k="Fecha/hora de entrega" v={snap.fecha_entrega} />
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground">Documentos entregados</p>
        <ul className="mt-1.5 space-y-1 text-sm">
          {docs.map((label, i) => (
            <li key={i} className="flex gap-2"><span className="text-emerald-600">✓</span>{label}</li>
          ))}
          {docs.length === 0 && <li className="text-muted-foreground">Sin documentos marcados.</li>}
        </ul>
      </div>

      <div className="mt-5 space-y-4">
        <section className="space-y-3 rounded-lg border p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Responsable de la entrega</p>
          <Campo label="Nombre y apellido *" value={respNombre} onChange={setRespNombre} upper />
          <Campo label="Cargo *" value={respCargo} onChange={setRespCargo} upper />
        </section>

        <section className="space-y-2 rounded-lg border p-3">
          <Label className="text-xs font-semibold uppercase text-muted-foreground">
            ¿La persona que firma es la misma responsable? *
          </Label>
          <RadioGroup value={firmanteEsResp} onValueChange={(v) => setFirmanteEsResp(v as "si" | "no")} className="flex gap-4">
            <label className="flex items-center gap-1.5 text-sm"><RadioGroupItem value="si" /> Sí</label>
            <label className="flex items-center gap-1.5 text-sm"><RadioGroupItem value="no" /> No</label>
          </RadioGroup>
          {firmanteEsResp === "no" && (
            <div className="space-y-3 pt-2">
              <Campo label="Nombre del firmante *" value={firmNombre} onChange={setFirmNombre} upper />
              <Campo label="Cargo del firmante *" value={firmCargo} onChange={setFirmCargo} upper />
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-lg border p-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Tipo de ambulancia *</Label>
            <Select value={tipoAmb} onValueChange={setTipoAmb}>
              <SelectTrigger><SelectValue placeholder="Seleccione…" /></SelectTrigger>
              <SelectContent>
                {TIPOS_AMBULANCIA.map((v) => (<SelectItem key={v} value={v}>{v}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <Campo label="Teléfono de contacto *" value={telefono} onChange={setTelefono} />

          <label className="flex items-start gap-2 text-xs">
            <Checkbox checked={reportarOtra} onCheckedChange={(v) => setReportarOtra(!!v)} className="mt-0.5" />
            <span className="leading-relaxed text-muted-foreground">
              La empresa que realmente llegó es diferente a la asignada ({empresaSnap || "—"}).
            </span>
          </label>
          {reportarOtra && (
            <div className="space-y-3">
              <Campo label="Empresa realmente presente *" value={empresaOtra} onChange={setEmpresaOtra} upper />
              <Campo label="Motivo del cambio *" value={motivoOtra} onChange={setMotivoOtra} />
            </div>
          )}
        </section>

        <div className="space-y-1.5">
          <Label className="text-xs font-medium">Firma *</Label>
          <SignaturePad ref={padRef} />
        </div>

        <label className="flex items-start gap-2 rounded-md border bg-card p-3 text-xs">
          <Checkbox checked={acepta} onCheckedChange={(v) => setAcepta(!!v)} className="mt-0.5" />
          <span className="leading-relaxed text-muted-foreground">{TEXTO_ACEPTACION}</span>
        </label>

        {error && <p className="text-sm font-medium text-destructive">{error}</p>}

        <Button className="w-full" onClick={onSubmit} disabled={enviando}>
          {enviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Firmar y enviar
        </Button>
      </div>
    </div>
  );
}

function Dato({ k, v }: { k: string; v?: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium text-foreground">{v || "—"}</span>
    </div>
  );
}

function Campo({
  label,
  value,
  onChange,
  upper,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  upper?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(upper ? e.target.value.toUpperCase() : e.target.value)}
        className={upper ? "uppercase" : ""}
      />
    </div>
  );
}
