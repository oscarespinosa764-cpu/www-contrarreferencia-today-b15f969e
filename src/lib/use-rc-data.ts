import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import type { Caso, MedicoCat, UnidadCat, MotivoCanCat, IpsCiudades, Plantilla } from "@/lib/rc-utils";

export interface Catalogos {
  medicos: MedicoCat[];
  especialidades: string[];
  unidades: UnidadCat[];
  eapb: string[];
  regimenes: string[];
  ips: string[];
  ipsConCiudades: IpsCiudades[];
  ciudades: string[];
  motivosNeg: string[];
  motivosCancelacion: MotivoCanCat[];
  unidadesRequeridas: string[];
  placas: string[];
  empresasTep: string[];
}

const EMPTY: Catalogos = {
  medicos: [],
  especialidades: [],
  unidades: [],
  eapb: [],
  regimenes: [],
  ips: [],
  ipsConCiudades: [],
  ciudades: [],
  motivosNeg: [],
  motivosCancelacion: [],
  unidadesRequeridas: [],
  placas: [],
  empresasTep: [],
};

export function useCatalogos() {
  return useQuery({
    queryKey: ["rc-catalogos"],
    queryFn: async (): Promise<Catalogos> => {
      const { data, error } = await supabase
        .from("catalogos")
        .select("tipo, valor, extra1, extra2")
        .eq("activo", true)
        .limit(2000);
      if (error) throw error;
      const rows = data ?? [];
      const byTipo = (t: string) => rows.filter((r) => r.tipo === t);
      const ipsRows = byTipo("IPS");
      const ipsConCiudades: IpsCiudades[] = [];
      const ciudadesSet = new Set<string>();
      for (const r of ipsRows) {
        // extra1 puede traer varias sedes separadas por ";"
        const ciudades = (r.extra1 || "")
          .split(/[;\n]/)
          .map((c) => c.trim())
          .filter(Boolean);
        ciudades.forEach((c) => ciudadesSet.add(c));
        ipsConCiudades.push({ nombre: r.valor, ciudades });
      }
      return {
        medicos: byTipo("MEDICO").map((r) => ({
          nombre: r.valor,
          titulo: (r.extra1 || "Dr(a).").trim(),
          especialidad: (r.extra2 || "").trim(),
        })),
        especialidades: byTipo("ESPECIALIDAD").map((r) => r.valor),
        unidades: byTipo("UNIDAD").map((r) => ({
          nombre: r.valor,
          horas: parseInt(r.extra1 || "12", 10) || 12,
          horasAmp: parseInt(r.extra2 || r.extra1 || "12", 10) || 12,
        })),
        eapb: byTipo("EAPB").map((r) => r.valor),
        regimenes: byTipo("REGIMEN").map((r) => r.valor),
        ips: ipsRows.map((r) => r.valor),
        ipsConCiudades,
        ciudades: Array.from(ciudadesSet).sort(),
        motivosNeg: byTipo("MOTIVO_NEG").map((r) => r.valor),
        motivosCancelacion: byTipo("MOTIVO_CANCELACION").map((r) => ({
          nombre: r.valor,
          justificacion: (r.extra1 || "").trim(),
        })),
        unidadesRequeridas: byTipo("UNIDAD_REQUERIDA").map((r) => r.valor),
        placas: byTipo("PLACA").map((r) => r.valor),
        empresasTep: byTipo("EMPRESA_TEP").map((r) => r.valor),
      };
    },
    initialData: EMPTY,
  });
}

export function usePlantillas() {
  return useQuery({
    queryKey: ["rc-plantillas"],
    queryFn: async (): Promise<Plantilla[]> => {
      const { data, error } = await supabase
        .from("plantillas")
        .select("indicativo, categoria, subcategoria, nombre, mensaje")
        .eq("archivado", false)
        .eq("activo", true)
        .limit(2000);
      if (error) throw error;
      return (data ?? []).map((p) => ({
        indicativo: p.indicativo || "",
        categoria: p.categoria || "",
        subcategoria: p.subcategoria || "",
        nombre: p.nombre || "",
        mensaje: p.mensaje || "",
      }));
    },
    initialData: [] as Plantilla[],
  });
}

export function useCasos() {
  return useQuery({
    queryKey: ["rc-casos"],
    queryFn: async (): Promise<Caso[]> => {
      const { data, error } = await supabase
        .from("casos_entrantes")
        .select("*")
        .eq("archivado", false)
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as Caso[];
    },
    initialData: [] as Caso[],
  });
}
