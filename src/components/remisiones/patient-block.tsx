import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

const DOC_TYPES = ["CC", "CE", "TI", "RC", "RNV", "ASI", "MSI"];
const SRC_TABLES = ["remisiones", "domiciliarios", "referencia_interna"] as const;

async function findByDoc(doc: string) {
  for (const t of SRC_TABLES) {
    const { data } = await supabase
      .from(t)
      .select("paciente,tipo_documento")
      .eq("documento", doc)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data[0]?.paciente) {
      return {
        paciente: data[0].paciente as string,
        tipo_documento: (data[0].tipo_documento as string | null) ?? "",
      };
    }
  }
  return null;
}

async function findByName(name: string) {
  for (const t of SRC_TABLES) {
    const { data } = await supabase
      .from(t)
      .select("documento,tipo_documento")
      .ilike("paciente", name)
      .order("created_at", { ascending: false })
      .limit(1);
    if (data && data[0]?.documento) {
      return {
        documento: data[0].documento as string,
        tipo_documento: (data[0].tipo_documento as string | null) ?? "",
      };
    }
  }
  return null;
}

const LBL = "text-[11px] font-semibold uppercase tracking-wide text-muted-foreground";

export function PatientBlock({ requireDoc = true }: { requireDoc?: boolean }) {
  const [paciente, setPaciente] = useState("");
  const [documento, setDocumento] = useState("");
  const [tipoDoc, setTipoDoc] = useState("");
  const tName = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const tDoc = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const onDocChange = (v: string) => {
    setDocumento(v);
    clearTimeout(tDoc.current);
    if (v.trim().length < 3) return;
    tDoc.current = setTimeout(async () => {
      const r = await findByDoc(v.trim());
      if (r) {
        setPaciente(r.paciente);
        if (r.tipo_documento) setTipoDoc(r.tipo_documento);
      }
    }, 400);
  };

  const onNameChange = (v: string) => {
    setPaciente(v);
    clearTimeout(tName.current);
    if (v.trim().length < 4) return;
    tName.current = setTimeout(async () => {
      const r = await findByName(v.trim());
      if (r) {
        setDocumento(r.documento);
        if (r.tipo_documento) setTipoDoc(r.tipo_documento);
      }
    }, 500);
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="paciente" className={LBL}>
          Nombres y apellidos paciente
          <span className="ml-0.5 text-status-red">*</span>
        </Label>
        <Input
          id="paciente"
          name="paciente"
          value={paciente}
          required
          autoComplete="off"
          onChange={(e) => onNameChange(e.target.value)}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="tipo_documento" className={LBL}>
          Tipo de documento
          <span className="ml-0.5 text-status-red">*</span>
        </Label>
        <select
          id="tipo_documento"
          name="tipo_documento"
          value={tipoDoc}
          required
          onChange={(e) => setTipoDoc(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <option value="" disabled>
            Seleccione…
          </option>
          {DOC_TYPES.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="documento" className={LBL}>
          Documento
          {requireDoc && <span className="ml-0.5 text-status-red">*</span>}
        </Label>
        <Input
          id="documento"
          name="documento"
          value={documento}
          required={requireDoc}
          autoComplete="off"
          inputMode="numeric"
          onChange={(e) => onDocChange(e.target.value)}
        />
      </div>
    </>
  );
}
