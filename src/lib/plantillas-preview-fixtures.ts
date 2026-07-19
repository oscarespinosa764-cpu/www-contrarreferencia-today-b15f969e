// ============================================================
// Datos ficticios canónicos para la vista previa administrativa
// de plantillas. NUNCA se usan datos reales de pacientes.
// ============================================================

export const FIXTURE_PACIENTE = {
  nombre: "PACIENTE DE PRUEBA",
  documento: "0000000000",
  edad: 45,
  sexo: "F",
  eapb: "EAPB DE PRUEBA",
  diagnostico: "DIAGNÓSTICO DE PRUEBA",
  cie10: "Z00.0",
};

export const FIXTURE_CASO = {
  codigo: "ENT-2026-0001",
  fecha: new Date().toISOString(),
  sede: "SEDE DE PRUEBA",
  unidad: "UNIDAD DE PRUEBA",
  ips_receptora: "IPS DE PRUEBA",
  estado: "ACEPTADO",
};

export const FIXTURE_FUNCIONARIO = {
  nombre: "FUNCIONARIO DE PRUEBA",
  cargo: "COORDINADOR DE PRUEBA",
  documento: "0000000001",
};

export function fixtureOficioMensaje(tipo: string): string {
  switch (tipo) {
    case "ACEP":
      return `Se acepta el caso del paciente *${FIXTURE_PACIENTE.nombre}*, documento ${FIXTURE_PACIENTE.documento}.\n\n- Diagnóstico: ${FIXTURE_PACIENTE.diagnostico}\n- IPS receptora: ${FIXTURE_CASO.ips_receptora}\n- Sede: ${FIXTURE_CASO.sede}`;
    case "NEG":
      return `No se acepta el caso del paciente *${FIXTURE_PACIENTE.nombre}*.\n\n- Motivo: ==criterio clínico==\n- Fecha: ${new Date().toLocaleDateString("es-CO")}`;
    case "CAN":
      return `Se registra la cancelación del caso ${FIXTURE_CASO.codigo}.\n\nMotivo: solicitado por la IPS remitente.`;
    case "CRUE_ACEP":
      return `Se acepta el direccionamiento del CRUE para el paciente *${FIXTURE_PACIENTE.nombre}*.`;
    case "CRUE_NEG":
      return `No es posible aceptar el direccionamiento del CRUE.\n\n- Motivo: capacidad instalada agotada.`;
    default:
      return "Contenido de prueba.";
  }
}

/**
 * Marca visualmente el bloque de vista previa: agrega un aviso al inicio y
 * al pie para dejar claro que se está mostrando información ficticia.
 */
export const AVISO_PREVIEW =
  "VISTA PREVIA CON DATOS FICTICIOS · NO REPRESENTA UN CASO REAL";
