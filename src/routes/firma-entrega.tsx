import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { obtenerSesionFirma, firmarEntrega } from "@/lib/entrega-firma.functions";
import { SignaturePad, type SignaturePadHandle } from "@/components/cuadro-turno/signature-pad";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, ShieldCheck, CircleAlert, CheckCircle2 } from "lucide-react";

const TEXTO_ACEPTACION =
  "Declaro que recibo la documentación relacionada en la lista de chequeo para el traslado " +
  "del paciente y que la información registrada corresponde a la entrega realizada.";

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
  paciente?: string;
  documento?: string;
  ips_receptora?: string;
  empresa_traslado?: string;
  fecha_entrega?: string;
  documentos?: { label: string; marcado: boolean }[];
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

  const [nombre, setNombre] = useState("");
  const [cargo, setCargo] = useState("");
  const [empresa, setEmpresa] = useState("");
  const [documento, setDocumento] = useState("");
  const [telefono, setTelefono] = useState("");
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
    return (
      <Aviso
        icon={<CircleAlert className="h-6 w-6 text-destructive" />}
        title="Enlace no válido"
        text="No encontramos esta entrega. Solicite generar un nuevo enlace de firma."
      />
    );
  if (estado === "VENCIDA")
    return (
      <Aviso
        icon={<CircleAlert className="h-6 w-6 text-amber-600" />}
        title="Enlace vencido"
        text="Este enlace de firma ha vencido. Solicite generar uno nuevo."
      />
    );
  if (estado === "ANULADA")
    return (
      <Aviso
        icon={<CircleAlert className="h-6 w-6 text-destructive" />}
        title="Enlace anulado"
        text="Este enlace de firma fue anulado. Solicite generar uno nuevo."
      />
    );
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

  const snap = (sesion.data?.snapshot ?? {}) as Snap;
  const docs = snap.documentos ?? [];

  const onSubmit = async () => {
    setError("");
    if (nombre.trim().length < 2) return setError("Indique su nombre y apellido.");
    if (cargo.trim().length < 2) return setError("Indique su cargo.");
    if (padRef.current?.isEmpty()) return setError("Debe firmar en la pantalla.");
    if (!acepta) return setError("Debe aceptar la declaración de recibido.");
    const firma_data = padRef.current?.toDataURL() ?? "";

    setEnviando(true);
    try {
      const res = await firmar({
        data: {
          token: t!,
          firmante_nombre: nombre.trim(),
          firmante_cargo: cargo.trim(),
          firmante_empresa: empresa.trim(),
          firmante_documento: documento.trim(),
          firmante_telefono: telefono.trim(),
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
        <Dato k="Paciente" v={snap.paciente} />
        <Dato k="Documento" v={snap.documento} />
        <Dato k="IPS receptora" v={snap.ips_receptora} />
        <Dato k="Empresa de traslado" v={snap.empresa_traslado} />
        <Dato k="Fecha/hora de entrega" v={snap.fecha_entrega} />
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase text-muted-foreground">
          Documentos entregados
        </p>
        <ul className="mt-1.5 space-y-1 text-sm">
          {docs.filter((d) => d.marcado).map((d, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-emerald-600">✓</span>
              {d.label}
            </li>
          ))}
          {docs.filter((d) => d.marcado).length === 0 && (
            <li className="text-muted-foreground">Sin documentos marcados.</li>
          )}
        </ul>
      </div>

      <div className="mt-5 space-y-3">
        <Campo label="Nombre y apellido *" value={nombre} onChange={setNombre} />
        <Campo label="Cargo *" value={cargo} onChange={setCargo} />
        <Campo label="Empresa de ambulancia" value={empresa} onChange={setEmpresa} />
        <Campo label="Documento o identificación laboral" value={documento} onChange={setDocumento} />
        <Campo label="Teléfono (opcional)" value={telefono} onChange={setTelefono} />

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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
