import { buildOficioHTML } from "@/lib/oficio";

interface Props {
  titulo: string;
  codigo: string;
  mensaje: string;
}

/**
 * Vista previa del oficio institucional. Renderiza exactamente el mismo
 * HTML que se copia al correo, para que lo que se ve sea lo que se pega.
 */
export function OficioPreview({ titulo, codigo, mensaje }: Props) {
  return (
    <div className="max-h-[60vh] overflow-auto rounded-xl border border-border bg-muted/30 p-3">
      <div dangerouslySetInnerHTML={{ __html: buildOficioHTML(titulo, codigo, mensaje) }} />
    </div>
  );
}
