// GU-FR-50 · BITÁCORA DE REFERENCIA Y CONTRARREFERENCIA (versión 02).
//
// FUENTE ÚNICA DE VERDAD para plantilla, importación y exportación de la
// bitácora. Cuatro hojas exactas, en este orden:
//   1. ENTRANTES              (26 columnas, A:Z)
//   2. SALIENTES              (28 columnas, A:AB)
//   3. ATENCION DOMICILIARIA  (21 columnas, A:U)  → PHD/PAD/O2/ESPECIAL
//   4. REFERENCIAS INTERNAS   (19 columnas, A:S)
//
// Fila 1: agrupaciones · Fila 2: encabezados · Fila 3: primera fila de datos.
// NO existe la hoja "NO BORRAR": los catálogos se validan contra la base de
// datos y las fuentes canónicas del aplicativo, nunca contra el Excel.
//
// El binario base es el activo versionado GU-FR-50-V02.xlsx (logos, estilos,
// bordes, impresión). Nunca se reconstruye el formato desde cero.

import plantillaAsset from "@/assets/gu-fr-50-v02.xlsx.asset.json";

export const GU_FR_50 = {
  codigo: "GU-FR-50",
  version: "02",
  archivo: "GU-FR-50-V02.xlsx",
  url: plantillaAsset.url,
  sha256: "5e796d111f824b3109ef21751d476d26e6c0e2d966bda43821d0db18994ddd16",
} as const;

export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export const FILA_AGRUPACION = 1;
export const FILA_ENCABEZADO = 2;
export const FILA_DATOS = 3;

export type TipoCelda = "texto" | "fecha" | "duracion" | "numero" | "codigo";

export interface ColumnaCanonica {
  /** Letra de columna en la plantilla. */
  col: string;
  /** Encabezado exacto de la fila 2 (tal cual está en el archivo oficial). */
  header: string;
  /** Campo canónico del aplicativo. */
  campo: string;
  tipo: TipoCelda;
  /** Catálogo canónico contra el que se valida (server-side), si aplica. */
  catalogo?: string;
}

export interface HojaCanonica {
  nombre: string;
  indice: number;
  columnas: ColumnaCanonica[];
}

const c = (
  col: string,
  header: string,
  campo: string,
  tipo: TipoCelda,
  catalogo?: string,
): ColumnaCanonica => ({ col, header, campo, tipo, ...(catalogo ? { catalogo } : {}) });

export const HOJA_ENTRANTES: HojaCanonica = {
  nombre: "ENTRANTES",
  indice: 1,
  columnas: [
    c("A", "FECHA Y HORA ENVIO DE REMISION", "fecha_envio", "fecha"),
    c("B", "IPS QUE REMITE", "ips_remite", "texto", "IPS"),
    c("C", "CIUDAD Y DEPARTAMENTO", "ciudad_departamento", "texto", "CIUDAD"),
    c("D", "NUMERO DE IDENTIFICACION", "documento", "codigo"),
    c("E", "NOMBRES Y APELLIDOS", "paciente", "texto"),
    c("F", "EDAD", "edad", "numero"),
    c("G", "AÑOS/MESES/DIAS", "unidad_edad", "texto"),
    c("H", "EAPB / ASEGURADORA", "eapb", "texto", "EAPB"),
    c("I", "ESPECIALIDAD PRINCIPAL A LA QUE SE REMITE", "especialidad", "texto", "ESPECIALIDAD"),
    c("J", "CIE-10", "cie10", "codigo", "CIE10"),
    c("K", "DESCRIPCION DEL CIE -10", "cie10_descripcion", "texto"),
    c("L", "FECHA Y HORA DE RESPUESTA", "fecha_respuesta", "fecha"),
    c("M", "OPORTUNIDAD DE RESPUESTA", "oportunidad_respuesta", "duracion"),
    c("N", "CODIGO DE ACEPTACION", "codigo_aceptacion", "codigo"),
    c("O", "ESTADO DE SOLICITUD", "estado", "texto", "ESTADO"),
    c("P", "MOTIVOS", "motivos", "texto", "MOTIVO"),
    c("Q", "JUSTIFICACION", "justificacion", "texto"),
    c("R", "UNIDAD A LA QUE INGRESA", "unidad", "texto", "UNIDAD"),
    c("S", "INGRESA A CEDIM", "ingresa", "texto"),
    c("T", "JUSTIFICACION DE CONFIRMACION", "justificacion_confirmacion", "texto"),
    c("U", "CODIGO DE DIRECCIONAMIENTO CRUE", "codigo_crue", "codigo"),
    c("V", "TIPO DE AMBULANCIA", "tipo_ambulancia", "texto", "TIPO_AMBULANCIA"),
    c("W", "EMPRESA", "empresa_traslado", "texto", "EMPRESA_TRASLADO"),
    c("X", "PLACA VEHICULO", "placa", "codigo"),
    c("Y", "NOMBRE Y APELLIDO DE PROFESIONAL A CARGO", "profesional", "texto"),
    c("Z", "CARGO", "cargo", "texto"),
  ],
};

export const HOJA_SALIENTES: HojaCanonica = {
  nombre: "SALIENTES",
  indice: 2,
  columnas: [
    c("A", "FECHA Y HORA DE SOLICITUD", "fecha_solicitud", "fecha"),
    c(
      "B",
      "FECHA Y HORA DE REPORTE A LA EPS -CRUE / ACEPTACION CEDIM IPS",
      "fecha_reporte_eps",
      "fecha",
    ),
    c("C", "OPORTUNIDAD TRAMITE DE REMISION", "oportunidad_tramite", "duracion"),
    c("D", "NUMERO DE IDENTIFICACION", "documento", "codigo"),
    c("E", "NOMBRES Y APELLIDOS", "paciente", "texto"),
    c("F", "EDAD", "edad", "numero"),
    c("G", "AÑOS/MESES/DIAS", "unidad_edad", "texto"),
    c("H", "EAPB / ASEGURADORA", "eapb", "texto", "EAPB"),
    c("I", "REGIMEN", "regimen", "texto", "REGIMEN"),
    c("J", "SERVICIO QUE REMITE", "servicio_remite", "texto", "SERVICIO"),
    c("K", "MOTIVO DE REMISION", "motivo_remision", "texto", "MOTIVO"),
    c("L", "ESPECIALIDAD REMITENTE", "especialidad_remitente", "texto", "ESPECIALIDAD"),
    c("M", "CIE10", "cie10", "codigo", "CIE10"),
    c("N", "DESCRIPCION", "cie10_descripcion", "texto"),
    c("O", "IPS RECEPTORA", "ips_receptora", "texto", "IPS"),
    c("P", "CIUDAD", "ciudad", "texto", "CIUDAD"),
    c("Q", "ESPECIALIDAD RECEPTORA", "especialidad_receptora", "texto", "ESPECIALIDAD"),
    c("R", "SERVICIO RECEPTOR", "servicio_receptor", "texto", "SERVICIO"),
    c("S", "FECHA Y HORA ACEPTACION", "fecha_aceptacion", "fecha"),
    c("T", "OPORTUNIDAD", "oportunidad_aceptacion", "duracion"),
    c("U", "FECHA Y HORA SOLICITUD AMBULANCIA", "fecha_solicitud_ambulancia", "fecha"),
    c("V", "EMPRESA DE TRASLADO", "empresa_traslado", "texto", "EMPRESA_TRASLADO"),
    c("W", "TIPO DE AMBULANCIA", "tipo_ambulancia", "texto", "TIPO_AMBULANCIA"),
    c("X", "FECHA Y HORA TRASLADO", "fecha_traslado", "fecha"),
    c("Y", "OPORTUNIDAD TRASLADO", "oportunidad_traslado", "duracion"),
    c("Z", "ACTUAL", "estado_actual", "texto", "ESTADO"),
    c("AA", "MOTIVO", "motivo_estado", "texto", "MOTIVO"),
    c("AB", "OBSERVACIONES", "observaciones", "texto"),
  ],
};

export const HOJA_DOMICILIARIA: HojaCanonica = {
  nombre: "ATENCION DOMICILIARIA",
  indice: 3,
  columnas: [
    c("A", "FECHA Y HORA DE SOLICITUD", "fecha_solicitud", "fecha"),
    c("B", "FECHA Y HORA DE COMENTADO", "fecha_comentado", "fecha"),
    c("C", "OPORTUNIDAD DE RESPUESTA", "oportunidad_respuesta", "duracion"),
    c("D", "NUMERO DE IDENTIFICACION", "documento", "codigo"),
    c("E", "NOMBRES Y APELLIDOS", "paciente", "texto"),
    c("F", "EDAD", "edad", "numero"),
    c("G", "AÑOS/MESES/DIAS", "unidad_edad", "texto"),
    c("H", "EAPB / ASEGURADORA", "eapb", "texto", "EAPB"),
    c("I", "REGIMEN", "regimen", "texto", "REGIMEN"),
    c("J", "SERVICIO QUE REMITE", "servicio_remite", "texto", "SERVICIO"),
    c("K", "ESPECIALIDAD REMITENTE", "especialidad_remitente", "texto", "ESPECIALIDAD"),
    // Subtipo canónico: PHD | PAD | O2 | ESPECIAL (nunca se fusiona ni se pierde).
    c("L", "TIPO DE SOLICITUD", "tipo_solicitud", "texto", "TIPO_SOLICITUD_DOMICILIARIA"),
    c("M", "CIE10", "cie10", "codigo", "CIE10"),
    c("N", "DESCRIPCION", "cie10_descripcion", "texto"),
    c("O", "ESTADO", "estado", "texto", "ESTADO"),
    c("P", "REQUIERE AMBULANCIA", "requiere_ambulancia", "texto"),
    c("Q", "TIPO DE AMBULANCIA", "tipo_ambulancia", "texto", "TIPO_AMBULANCIA"),
    c("R", "EMPRESA DE TRASLADO", "empresa_traslado", "texto", "EMPRESA_TRASLADO"),
    c("S", "FECHA Y HORA TRASLADO Y/O EGRESO", "fecha_traslado", "fecha"),
    c("T", "OPORTUNIDAD TRASLADO", "oportunidad_traslado", "duracion"),
    c("U", "OBSERVACIONES", "observaciones", "texto"),
  ],
};

export const HOJA_INTERNAS: HojaCanonica = {
  nombre: "REFERENCIAS INTERNAS",
  indice: 4,
  columnas: [
    c("A", "FECHA Y HORA SOLICITUD", "fecha_solicitud", "fecha"),
    c("B", "NUMERO DE IDENTIFICACION", "documento", "codigo"),
    c("C", "NOMBRES Y APELLIDOS", "paciente", "texto"),
    c("D", "EDAD", "edad", "numero"),
    c("E", "ENTIDAD", "entidad", "texto", "EAPB"),
    c("F", "VX// EXAMEN", "vx_examen", "texto"),
    c("G", "ESPECIALIDAD SOLICITANTE", "especialidad_solicitante", "texto", "ESPECIALIDAD"),
    c("H", "CIE10 Y DESCRIPCCION", "cie10_descripcion", "texto"),
    c("I", "FECHA Y HORA DE SOLICITUD VALORACION", "fecha_solicitud_valoracion", "fecha"),
    c("J", "OPORTUNIDADE SOLCITUD", "oportunidad_solicitud", "duracion"),
    c("K", "FECHA Y HORA DE VALORACION", "fecha_valoracion", "fecha"),
    c("L", "OPORTUNIDAD DE RESPUESTA", "oportunidad_respuesta", "duracion"),
    c("M", "IPS QUE ACEPTA", "ips_acepta", "texto", "IPS"),
    c("N", "CIUDAD", "ciudad", "texto", "CIUDAD"),
    c("O", "FECHA Y HORA SOLICITUD AMBULANCIA", "fecha_solicitud_ambulancia", "fecha"),
    c("P", "AMBULANCIA DE TRASLADO", "empresa_traslado", "texto", "EMPRESA_TRASLADO"),
    c("Q", "TIPO DE AMBULANCIA", "tipo_ambulancia", "texto", "TIPO_AMBULANCIA"),
    c("R", "TIPO DE RECORRIDO", "tipo_recorrido", "texto", "TIPO_RECORRIDO"),
    c("S", "OBSERVACION", "observacion", "texto"),
  ],
};

/** Las CUATRO hojas canónicas, en orden. No agregar una quinta. */
export const HOJAS_GU_FR_50: HojaCanonica[] = [
  HOJA_ENTRANTES,
  HOJA_SALIENTES,
  HOJA_DOMICILIARIA,
  HOJA_INTERNAS,
];

export const NOMBRES_HOJAS = HOJAS_GU_FR_50.map((h) => h.nombre);

export type ModuloGuFr50 =
  | "ENTRANTES"
  | "SALIENTES"
  | "ATENCION DOMICILIARIA"
  | "REFERENCIAS INTERNAS";

/** Normaliza un encabezado para reconocerlo (espacios, tildes, mayúsculas). */
export function normalizarEncabezado(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/**
 * Neutraliza inyección de fórmulas: cualquier texto proveniente de datos que
 * empiece por = + - @ se exporta como texto literal.
 */
export function neutralizarFormula(v: unknown): unknown {
  if (typeof v !== "string") return v;
  return /^[=+\-@]/.test(v.trim()) ? `'${v}` : v;
}

export interface ValidacionEstructura {
  ok: boolean;
  errores: string[];
  hojasEncontradas: string[];
}

/**
 * Validación estructural canónica de un libro GU-FR-50.
 * Rechaza hojas adicionales (incluida "NO BORRAR"), faltantes, desordenadas
 * o con encabezados críticos alterados en la fila 2.
 */
export function validarEstructuraGuFr50(
  hojas: { nombre: string; encabezados: unknown[] }[],
): ValidacionEstructura {
  const errores: string[] = [];
  const encontradas = hojas.map((h) => h.nombre.trim());

  if (hojas.length !== 4) {
    errores.push(
      `El archivo debe tener exactamente 4 hojas (${NOMBRES_HOJAS.join(", ")}). Encontradas: ${hojas.length}.`,
    );
  }
  for (const nombre of encontradas) {
    if (!NOMBRES_HOJAS.includes(nombre)) {
      errores.push(
        nombre.toUpperCase().includes("NO BORRAR")
          ? 'La hoja "NO BORRAR" fue eliminada del formato oficial y no se admite.'
          : `Hoja no reconocida: "${nombre}".`,
      );
    }
  }
  HOJAS_GU_FR_50.forEach((def, i) => {
    const hoja = hojas[i];
    if (!hoja) {
      errores.push(`Falta la hoja "${def.nombre}" en la posición ${i + 1}.`);
      return;
    }
    if (hoja.nombre.trim() !== def.nombre) {
      errores.push(
        `Orden/nombre incorrecto: la posición ${i + 1} debe ser "${def.nombre}" y es "${hoja.nombre}".`,
      );
      return;
    }
    def.columnas.forEach((col, idx) => {
      const real = normalizarEncabezado(hoja.encabezados[idx]);
      const esperado = normalizarEncabezado(col.header);
      if (real !== esperado) {
        errores.push(
          `${def.nombre}!${col.col}${FILA_ENCABEZADO}: se esperaba "${col.header}" y se encontró "${String(hoja.encabezados[idx] ?? "")}".`,
        );
      }
    });
  });

  return { ok: errores.length === 0, errores, hojasEncontradas: encontradas };
}

/** Descarga bytes XLSX en el navegador (sin Buffer ni APIs de Node). */
export function descargarXlsx(bytes: Uint8Array, nombre: string) {
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const url = URL.createObjectURL(new Blob([ab], { type: XLSX_MIME }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Fila canónica: campo canónico -> valor ya resuelto por el servidor. */
export type FilaGuFr50 = Record<string, string | number | Date | null | undefined>;

/**
 * Construye el libro GU-FR-50 partiendo del binario oficial (estilos, logos,
 * agrupaciones y configuración de impresión intactos) y escribiendo los datos
 * desde la fila 3. Las hojas sin datos quedan vacías pero presentes.
 */
export async function construirLibroGuFr50(
  datos: Partial<Record<ModuloGuFr50, FilaGuFr50[]>> = {},
): Promise<Uint8Array> {
  const ExcelJS = (await import("exceljs")).default;
  const resp = await fetch(GU_FR_50.url);
  if (!resp.ok) throw new Error("No se pudo cargar la plantilla oficial GU-FR-50.");
  const base = await resp.arrayBuffer();

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(base);

  for (const def of HOJAS_GU_FR_50) {
    const ws = wb.getWorksheet(def.nombre);
    if (!ws) throw new Error(`PLANTILLA_INVALIDA: falta la hoja ${def.nombre}`);

    // Limpiar filas de ejemplo/plantilla desde la fila 3 (sin tocar estilos).
    const ultima = ws.actualRowCount;
    for (let r = FILA_DATOS; r <= ultima; r++) {
      const row = ws.getRow(r);
      def.columnas.forEach((col) => {
        row.getCell(col.col).value = null;
      });
    }

    const filas = datos[def.nombre as ModuloGuFr50] ?? [];
    filas.forEach((fila, i) => {
      const row = ws.getRow(FILA_DATOS + i);
      def.columnas.forEach((col) => {
        const bruto = fila[col.campo];
        if (bruto === null || bruto === undefined || bruto === "") {
          row.getCell(col.col).value = null;
          return;
        }
        const celda = row.getCell(col.col);
        if (col.tipo === "fecha") {
          celda.value = bruto instanceof Date ? bruto : new Date(String(bruto));
        } else if (col.tipo === "numero") {
          const n = Number(bruto);
          celda.value = Number.isFinite(n) ? n : null;
        } else if (col.tipo === "codigo") {
          // Documentos, CIE-10, placas y códigos siempre como texto.
          celda.value = String(bruto);
          celda.numFmt = "@";
        } else {
          celda.value = neutralizarFormula(bruto) as string;
        }
      });
      row.commit();
    });
  }

  const buf = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return new Uint8Array(buf);
}

/** Descarga la plantilla oficial vacía (cuatro hojas, sin datos). */
export async function descargarPlantillaGuFr50() {
  const bytes = await construirLibroGuFr50({});
  descargarXlsx(bytes, GU_FR_50.archivo);
}
