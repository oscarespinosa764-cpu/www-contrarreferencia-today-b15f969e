import { useEffect, useState } from "react";
import { buildOficioHTML, buildOficioHTMLPublicado } from "@/lib/oficio";

interface Props {
  tipo: string;
  codigo: string;
  mensaje: string;
}

/**
 * Vista previa del oficio institucional. Renderiza EXACTAMENTE el mismo
 * HTML que se copia al correo, usando la configuración PUBLICADA desde
 * Control de Mando → Plantillas del sistema (FASE 9). Ante error usa
 * los valores por defecto para no bloquear la operación.
 */
export function OficioPreview({ tipo, codigo, mensaje }: Props) {
  const [html, setHtml] = useState<string>(() => buildOficioHTML(tipo, codigo, mensaje));

  useEffect(() => {
    let cancelled = false;
    buildOficioHTMLPublicado(tipo, codigo, mensaje)
      .then((h) => {
        if (!cancelled) setHtml(h);
      })
      .catch(() => {
        if (!cancelled) setHtml(buildOficioHTML(tipo, codigo, mensaje));
      });
    return () => {
      cancelled = true;
    };
  }, [tipo, codigo, mensaje]);

  return (
    <div className="max-h-[60vh] overflow-auto rounded-xl border border-border bg-muted/30 p-3">
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}
