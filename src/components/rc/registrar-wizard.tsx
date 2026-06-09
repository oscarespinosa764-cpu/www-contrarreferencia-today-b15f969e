import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AutoComplete } from "@/components/rc/autocomplete";
import { ResultadoCard } from "@/components/rc/resultado-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, ArrowRight, Search, AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  buscarAcepActivo,
  buscarAcepReciente,
  buildMensaje,
  calcHrsReserva,
  calcularVencimiento,
  fechaCasoStr,
  fmtFechaHora,
  fmtMinutos,
  nextCodigo,
  type Caso,
} from "@/lib/rc-utils";
import type { Catalogos } from "@/lib/use-rc-data";
import type { Plantilla } from "@/lib/rc-utils";

type Tipo = "ACEP" | "NEG" | "CRUE_ACEP" | "CRUE_NR" | "CRUE_NEG";

const CRUE_TIPOS: { value: Tipo; label: string }[] = [
  { value: "CRUE_ACEP", label: "Aceptación direccionamiento" },
  { value: "CRUE_NR", label: "No requerimiento" },
  { value: "CRUE_NEG", label: "Negación direccionamiento" },
];

const COMPLEJIDADES = ["MAYOR COMPLEJIDAD", "MENOR COMPLEJIDAD"];

interface Props {
  casos: Caso[];
  catalogos: Catalogos;
  plantillas: Plantilla[];
  onDone: () => void;
}

export function RegistrarWizard({ casos, catalogos, plantillas, onDone }: Props) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: string; codigo: string; mensaje: string } | null>(null);

  // Paso 1
  const [documento, setDocumento] = useState("");

  // Paso 2 — datos del paciente
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [eapb, setEapb] = useState("");
  const [regimen, setRegimen] = useState("");
  const [ips, setIps] = useState("");
  const [ciudad, setCiudad] = useState("");

  // Paso 3 — clasificación
  const [tipo, setTipo] = useState<Tipo | "">("");
  const [crueOpen, setCrueOpen] = useState(false);
  const [medico, setMedico] = useState("");
  const [especialidad, setEspecialidad] = useState("");
  const [unidad, setUnidad] = useState("");
  const [aseguramiento, setAseguramiento] = useState("EPS");
  const [motivoNeg, setMotivoNeg] = useState("");
  const [complejidad, setComplejidad] = useState("");
  const [detalle, setDetalle] = useState("");
  // CRUE
  const [codigoCrue, setCodigoCrue] = useState("");
  const [contactoIps, setContactoIps] = useState("");
  const [unidadReq, setUnidadReq] = useState("");
  const [motivosCrue, setMotivosCrue] = useState<string[]>(["", "", ""]);

  const reincidente = useMemo(() => {
    const doc = documento.trim();
    if (!doc) return null;
    return buscarAcepReciente(casos, doc);
  }, [documento, casos]);

  // Cupo activo = existe una aceptación vigente (con tiempo restante)
  const cupoActivoCaso = useMemo(() => {
    const doc = documento.trim();
    if (!doc) return null;
    return buscarAcepActivo(casos, doc);
  }, [documento, casos]);
  const cupoActivo = !!cupoActivoCaso;

  const reincVen = reincidente ? calcularVencimiento(reincidente, casos) : null;

  const unidadOptions = catalogos.unidades.map((u) => u.nombre);
  const isCrue = tipo === "CRUE_ACEP" || tipo === "CRUE_NR" || tipo === "CRUE_NEG";

  // ── Enlace IPS ⇄ Ciudad/Departamento ──
  const ipsEntry = catalogos.ipsConCiudades.find((x) => x.nombre === ips);
  const sedes = ipsEntry?.ciudades ?? [];
  const ciudadKey = ciudad.trim().toLowerCase();
  // Si hay una ciudad escrita, filtra las IPS relacionadas a esa ubicación
  const ipsOptions = ciudadKey
    ? catalogos.ipsConCiudades
        .filter((x) => x.ciudades.some((c) => c.toLowerCase().includes(ciudadKey)))
        .map((x) => x.nombre)
    : catalogos.ips;

  const onPickIps = (v: string) => {
    setIps(v);
    const e = catalogos.ipsConCiudades.find((x) => x.nombre === v);
    if (e && e.ciudades.length === 1) setCiudad(e.ciudades[0]);
  };

  // ── Enlace Médico ⇄ Especialidad ──
  const espKey = especialidad.trim().toLowerCase();
  const medicoOptions = espKey
    ? catalogos.medicos
        .filter((m) => !m.especialidad || m.especialidad.toLowerCase().includes(espKey))
        .map((m) => m.nombre)
    : catalogos.medicos.map((m) => m.nombre);

  const onPickMedico = (v: string) => {
    setMedico(v);
    const m = catalogos.medicos.find((x) => x.nombre === v);
    if (m?.especialidad) setEspecialidad(m.especialidad);
  };

  // Tiempo reservado de la unidad seleccionada
  const hrsUnidad = unidad ? calcHrsReserva(unidad, "ACEP", catalogos.unidades) : 0;

  const reset = () => {
    setStep(1);
    setDocumento("");
    setNombres("");
    setApellidos("");
    setEapb("");
    setRegimen("");
    setIps("");
    setCiudad("");
    setTipo("");
    setCrueOpen(false);
    setMedico("");
    setEspecialidad("");
    setUnidad("");
    setAseguramiento("EPS");
    setMotivoNeg("");
    setComplejidad("");
    setDetalle("");
    setCodigoCrue("");
    setContactoIps("");
    setUnidadReq("");
    setMotivosCrue(["", "", ""]);
    setResultado(null);
  };

  const guardar = async () => {
    if (!tipo) return toast.error("Selecciona el tipo de caso");
    if (tipo === "NEG" && !motivoNeg) return toast.error("Selecciona el motivo de negación");
    if (tipo === "NEG" && motivoNeg === "POR NIVEL DE COMPLEJIDAD" && !complejidad)
      return toast.error("Selecciona la complejidad");

    setBusy(true);
    try {
      const ahora = new Date();
      const codigo = nextCodigo(casos, tipo, ahora);

      const esActivo = tipo === "ACEP" || tipo === "CRUE_ACEP";
      const unidadEff = isCrue ? unidadReq : unidad;
      let fechaVenceISO: string | null = null;
      let fechaVenceStr = "";
      let hrs = 0;
      if (esActivo) {
        hrs = calcHrsReserva(unidadEff, tipo, catalogos.unidades);
        const venceD = new Date(ahora.getTime() + hrs * 3600000);
        fechaVenceISO = venceD.toISOString();
        fechaVenceStr = fmtFechaHora(venceD);
      }

      const motivoNegFull =
        motivoNeg === "POR NIVEL DE COMPLEJIDAD" && complejidad
          ? `POR NIVEL DE COMPLEJIDAD - ${complejidad}`
          : motivoNeg;

      const mensaje = buildMensaje(
        plantillas,
        catalogos.medicos,
        { codigo, fecha: fmtFechaHora(ahora), fechaVence: fechaVenceStr, hrsReserva: String(hrs || "") },
        {
          tipo,
          documento,
          ips,
          medico,
          especialidad,
          unidad: unidadEff,
          aseguramiento,
          detalle,
          motivoNeg: motivoNegFull,
          codigoCrue,
          contactoIps,
          eapb,
          regimen,
          motivosCrue: isCrue ? motivosCrue.filter(Boolean) : null,
        },
      );

      const { error } = await supabase.from("casos_entrantes").insert({
        codigo,
        tipo,
        documento: documento.trim(),
        nombres: nombres.trim() || null,
        apellidos: apellidos.trim() || null,
        eapb: eapb || null,
        regimen: regimen || null,
        ips: ips || null,
        medico: medico || null,
        especialidad: especialidad || null,
        unidad: unidadEff || null,
        aseguramiento: tipo === "ACEP" ? aseguramiento : null,
        detalle: detalle || null,
        estado: esActivo ? "ACTIVO" : "REGISTRADO",
        fecha: ahora.toISOString().slice(0, 10),
        fecha_vence: fechaVenceISO,
        hrs_reserva: hrs ? String(hrs) : null,
        texto_ia: mensaje || null,
        created_by: user?.id,
      });
      if (error) throw error;

      toast.success(`Registrado ${codigo}`);
      setResultado({ tipo, codigo, mensaje });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar el caso");
    } finally {
      setBusy(false);
    }
  };

  if (resultado) {
    return <ResultadoCard tipo={resultado.tipo} codigo={resultado.codigo} mensaje={resultado.mensaje} onNuevo={reset} />;
  }

  return (
    <div className="space-y-5">
      <StepIndicator step={step} />

      {/* ───── PASO 1 ───── */}
      {step === 1 && (
        <section className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="doc">Documento del paciente</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="doc"
                className="pl-9"
                inputMode="numeric"
                placeholder="Número de documento…"
                value={documento}
                onChange={(e) => setDocumento(e.target.value.replace(/\D/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && documento.trim().length >= 4 && !cupoActivo) {
                    e.preventDefault();
                    setStep(2);
                  }
                }}
                autoFocus
              />
            </div>
          </div>

          {reincidente && (
            <div
              className={`flex items-start gap-3 rounded-xl border p-3 ${
                cupoActivo
                  ? "border-status-red/50 bg-status-red/10"
                  : "border-status-amber/50 bg-status-amber/10"
              }`}
            >
              <AlertTriangle
                className={`mt-0.5 h-5 w-5 shrink-0 ${cupoActivo ? "text-status-red" : "text-status-amber"}`}
              />
              <div className="text-xs text-foreground">
                <p className={`font-bold ${cupoActivo ? "text-status-red" : "text-status-amber"}`}>
                  {cupoActivo ? "Paciente reincidente — cupo activo" : "Paciente reincidente"}
                </p>
                <p className="mt-0.5">
                  {reincidente.codigo} · {reincidente.unidad || "—"}
                  {cupoActivo && reincVen?.minRest != null ? ` · ${fmtMinutos(reincVen.minRest)}` : ""}
                </p>
                <p className="text-muted-foreground">Registrado el {fechaCasoStr(reincidente)}</p>
                {cupoActivo && (
                  <p className="mt-1 font-semibold text-status-red">
                    No se puede continuar: el cupo sigue vigente.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <Button
              type="button"
              className="rounded-full"
              disabled={documento.trim().length < 4 || cupoActivo}
              onClick={() => setStep(2)}
            >
              Continuar <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {/* ───── PASO 2 ───── */}
      {step === 2 && (
        <section className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nom">Nombres</Label>
              <Input id="nom" value={nombres} onChange={(e) => setNombres(e.target.value)} autoFocus />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ape">Apellidos</Label>
              <Input id="ape" value={apellidos} onChange={(e) => setApellidos(e.target.value)} />
            </div>
            <AutoComplete label="EAPB / Asegurador" value={eapb} onChange={setEapb} options={catalogos.eapb} />
            <div className="space-y-2">
              <Label>Régimen</Label>
              <Select value={regimen} onValueChange={setRegimen}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar…" />
                </SelectTrigger>
                <SelectContent>
                  {catalogos.regimenes.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="sm:col-span-2">
              <AutoComplete
                label="IPS que remite"
                value={ips}
                onChange={setIps}
                onPick={onPickIps}
                options={ipsOptions}
              />
              {sedes.length > 1 && (
                <div className="mt-1.5 rounded-lg border border-status-blue/40 bg-status-blue/10 p-2">
                  <p className="text-[11px] font-bold text-status-blue">
                    Tiene {sedes.length} sedes relacionadas — selecciona la ubicación
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {sedes.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setCiudad(s)}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${
                          ciudad === s
                            ? "border-status-blue bg-status-blue/20 text-status-blue"
                            : "border-border text-muted-foreground hover:border-status-blue/50"
                        }`}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <AutoComplete
                label="Ciudad / Departamento"
                value={ciudad}
                onChange={setCiudad}
                options={catalogos.ciudades}
                placeholder="Ej: FLORENCIA - CAQUETA"
              />
              {ciudad.trim() && ipsOptions.length > 0 && !ips && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {ipsOptions.length} IPS relacionada{ipsOptions.length === 1 ? "" : "s"} a esta ubicación
                </p>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(1)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Atrás
            </Button>
            <Button type="button" className="rounded-full" onClick={() => setStep(3)}>
              Continuar <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {/* ───── PASO 3 ───── */}
      {step === 3 && (
        <section className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de caso</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <TipoCard
                label="Aceptaciones"
                desc="Aceptación de cupo"
                accent="green"
                active={tipo === "ACEP"}
                onClick={() => {
                  setTipo("ACEP");
                  setCrueOpen(false);
                  setMotivoNeg("");
                  setComplejidad("");
                }}
              />
              <TipoCard
                label="Negaciones"
                desc="Negación de cupo"
                accent="red"
                active={tipo === "NEG"}
                onClick={() => {
                  setTipo("NEG");
                  setCrueOpen(false);
                }}
              />
              <TipoCard
                className="sm:col-span-2"
                label="Direccionamientos CRUE"
                desc="Aceptación · No requerimiento · Negación"
                accent="blue"
                active={isCrue || crueOpen}
                onClick={() => setCrueOpen((o) => !o)}
              />
            </div>
            {crueOpen && (
              <div className="grid gap-2 pt-1 sm:grid-cols-3">
                {CRUE_TIPOS.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setTipo(t.value)}
                    className={`rounded-xl border-2 px-3 py-2 text-left text-xs font-bold transition ${
                      tipo === t.value
                        ? "border-status-blue bg-status-blue/10 text-status-blue"
                        : "border-border text-foreground hover:border-status-blue/40"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {tipo === "ACEP" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <AutoComplete label="Médico que acepta" value={medico} onChange={setMedico} onPick={onPickMedico} options={medicoOptions} />
              <AutoComplete label="Especialidad" value={especialidad} onChange={setEspecialidad} options={catalogos.especialidades} />
              <div className="space-y-2">
                <Label>Servicio / Unidad</Label>
                <Select value={unidad} onValueChange={setUnidad}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {unidadOptions.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {unidad && (
                  <span className="inline-block rounded-full bg-status-blue/10 px-2.5 py-0.5 text-[11px] font-semibold text-status-blue">
                    Tiempo reservado: {hrsUnidad} horas
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <Label>Aseguramiento</Label>
                <Select value={aseguramiento} onValueChange={setAseguramiento}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {["EPS", "SOAT-ADRES", "ARL-POLIZA"].map((a) => (
                      <SelectItem key={a} value={a}>
                        {a}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {tipo === "NEG" && (
            <div className="space-y-2">
              <Label>Motivo de negación</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {catalogos.motivosNeg.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMotivoNeg(m);
                      setComplejidad("");
                    }}
                    className={`rounded-xl border-2 px-3 py-2 text-left text-xs font-bold transition ${
                      motivoNeg === m
                        ? "border-status-red bg-status-red/10 text-status-red"
                        : "border-border text-foreground hover:border-status-red/40"
                    }`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              {motivoNeg === "POR NIVEL DE COMPLEJIDAD" && (
                <div className="pt-1">
                  <Label className="text-[11px] text-muted-foreground">Complejidad</Label>
                  <div className="mt-1 grid gap-2 sm:grid-cols-2">
                    {COMPLEJIDADES.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setComplejidad(c)}
                        className={`rounded-lg border px-3 py-1.5 text-left text-xs transition ${
                          complejidad === c
                            ? "border-status-red bg-status-red/10 font-semibold text-status-red"
                            : "border-border text-muted-foreground hover:border-status-red/40"
                        }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}


          {isCrue && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="codcrue">Código CRUE</Label>
                <Input id="codcrue" value={codigoCrue} onChange={(e) => setCodigoCrue(e.target.value)} />
              </div>
              <AutoComplete label="Contacto / IPS" value={contactoIps} onChange={setContactoIps} options={catalogos.ips} />
              <div className="space-y-2 sm:col-span-2">
                <Label>Unidad requerida</Label>
                <Select value={unidadReq} onValueChange={setUnidadReq}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar…" />
                  </SelectTrigger>
                  <SelectContent>
                    {catalogos.unidadesRequeridas.map((u) => (
                      <SelectItem key={u} value={u}>
                        {u}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <AutoComplete label="Especialidad requerida" value={especialidad} onChange={setEspecialidad} options={catalogos.especialidades} />
              {tipo === "CRUE_NEG" && (
                <div className="space-y-2 sm:col-span-2">
                  <Label>Motivos de negación (hasta 3)</Label>
                  {[0, 1, 2].map((i) => (
                    <Input
                      key={i}
                      className="mt-1"
                      placeholder={`Motivo ${i + 1}`}
                      value={motivosCrue[i]}
                      onChange={(e) =>
                        setMotivosCrue((prev) => prev.map((m, idx) => (idx === i ? e.target.value : m)))
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {tipo && (
            <div className="space-y-2">
              <Label htmlFor="det">Observaciones / Detalle</Label>
              <Textarea id="det" rows={3} value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="Información adicional…" />
            </div>
          )}

          <div className="flex justify-between">
            <Button type="button" variant="ghost" className="rounded-full" onClick={() => setStep(2)}>
              <ArrowLeft className="mr-1.5 h-4 w-4" /> Atrás
            </Button>
            <Button type="button" className="rounded-full" disabled={!tipo || busy} onClick={guardar}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Generar y guardar
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function TipoCard({
  label,
  desc,
  accent,
  active,
  onClick,
  className,
}: {
  label: string;
  desc?: string;
  accent: "green" | "red" | "blue";
  active: boolean;
  onClick: () => void;
  className?: string;
}) {
  const activeBorder =
    accent === "green"
      ? "border-status-green bg-status-green/10"
      : accent === "red"
        ? "border-status-red bg-status-red/10"
        : "border-status-blue bg-status-blue/10";
  const activeText =
    accent === "green" ? "text-status-green" : accent === "red" ? "text-status-red" : "text-status-blue";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-2xl border-2 px-4 py-3 text-left transition ${
        active ? activeBorder : "border-border hover:border-foreground/30"
      } ${className || ""}`}
    >
      <p className={`text-sm font-bold ${active ? activeText : "text-foreground"}`}>{label}</p>
      {desc && <p className="mt-0.5 text-[11px] text-muted-foreground">{desc}</p>}
    </button>
  );
}



function StepIndicator({ step }: { step: number }) {
  const labels = ["Documento", "Datos", "Clasificación"];
  return (
    <div className="flex items-center justify-center gap-2">
      {labels.map((l, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={l} className="flex items-center gap-2">
            <div
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide ${
                active
                  ? "border-primary bg-primary/15 text-primary"
                  : done
                    ? "border-status-green/50 bg-status-green/10 text-status-green"
                    : "border-border text-muted-foreground"
              }`}
            >
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-current/10 text-[10px]">{n}</span>
              {l}
            </div>
            {i < labels.length - 1 && <span className="text-muted-foreground">›</span>}
          </div>
        );
      })}
    </div>
  );
}
