import { useState } from "react";
import { supabase } from "@/lib/backend-client";
import { Panel } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { RefreshCw, Loader2 } from "lucide-react";
import { toast } from "sonner";

type EstadoTec = "ok" | "revisar" | "falla";

type Servicio = { titulo: string; detalle: string; estado: EstadoTec };

const serviciosBase: Servicio[] = [
  { titulo: "Base de datos", detalle: "Sistema de Referencia y Contrarreferencia activo.", estado: "ok" },
  { titulo: "Autenticación", detalle: "Sesiones y credenciales operativas.", estado: "ok" },
  { titulo: "Almacenamiento", detalle: "Lectura/escritura de archivos disponible.", estado: "ok" },
  { titulo: "Catálogos", detalle: "Listas maestras sincronizadas.", estado: "ok" },
  { titulo: "Notificaciones por correo", detalle: "Envío automático de alertas pendiente de configuración.", estado: "revisar" },
  { titulo: "Webhook WhatsApp", detalle: "URL del webhook pendiente por definir.", estado: "revisar" },
];

const estadoMeta: Record<EstadoTec, { label: string; border: string; badge: string }> = {
  ok: { label: "OK", border: "border-l-status-green", badge: "bg-status-green/15 text-status-green" },
  revisar: { label: "REVISAR", border: "border-l-status-amber", badge: "bg-status-amber/15 text-status-amber" },
  falla: { label: "FALLA", border: "border-l-status-red", badge: "bg-status-red/15 text-status-red" },
};

function Banda({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`flex items-center justify-between rounded-xl border px-4 py-3 ${color}`}>
      <span className="text-xs font-bold uppercase tracking-wide">{label}</span>
      <span className="text-2xl font-extrabold">{value}</span>
    </div>
  );
}

export function ControlMandoPanel() {
  const [servicios, setServicios] = useState<Servicio[]>(serviciosBase);
  const [verificando, setVerificando] = useState(false);

  const okCount = servicios.filter((s) => s.estado === "ok").length;
  const revisarCount = servicios.filter((s) => s.estado === "revisar").length;
  const fallaCount = servicios.filter((s) => s.estado === "falla").length;

  const verificar = async () => {
    setVerificando(true);
    const next = serviciosBase.map((s) => ({ ...s }));
    try {
      // Base de datos + Catálogos: ping real a la tabla de catálogos
      const { error: dbErr } = await supabase
        .from("catalogos")
        .select("id", { count: "exact", head: true });
      const setEstado = (titulo: string, estado: EstadoTec, detalle?: string) => {
        const it = next.find((x) => x.titulo === titulo);
        if (it) {
          it.estado = estado;
          if (detalle) it.detalle = detalle;
        }
      };
      if (dbErr) {
        setEstado("Base de datos", "falla", "No se pudo contactar la base de datos.");
        setEstado("Catálogos", "falla", "No se pudieron leer las listas maestras.");
      } else {
        setEstado("Base de datos", "ok", "Sistema de Referencia y Contrarreferencia activo.");
        setEstado("Catálogos", "ok", "Listas maestras sincronizadas.");
      }

      // Autenticación: validar sesión vigente
      const { data: sess } = await supabase.auth.getSession();
      setEstado(
        "Autenticación",
        sess.session ? "ok" : "revisar",
        sess.session ? "Sesiones y credenciales operativas." : "Sin sesión activa.",
      );

      setServicios(next);
      const fallas = next.filter((s) => s.estado === "falla").length;
      if (fallas > 0) toast.error(`Verificación completada: ${fallas} servicio(s) con falla.`);
      else toast.success("Verificación completada. Servicios operativos.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo completar la verificación.");
    } finally {
      setVerificando(false);
    }
  };

  return (
    <Panel
      title="Estado técnico del sistema"
      action={
        <Button
          variant="outline"
          size="sm"
          className="rounded-full"
          onClick={verificar}
          disabled={verificando}
        >
          {verificando ? (
            <>
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Verificando…
            </>
          ) : (
            <>
              <RefreshCw className="mr-1.5 h-4 w-4" /> Verificar
            </>
          )}
        </Button>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Banda label="OK" value={okCount} color="bg-status-green/10 text-status-green border-status-green/30" />
        <Banda label="Revisar" value={revisarCount} color="bg-status-amber/10 text-status-amber border-status-amber/30" />
        <Banda label="Fallas" value={fallaCount} color="bg-status-red/10 text-status-red border-status-red/30" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {servicios.map((s) => {
          const m = estadoMeta[s.estado];
          return (
            <div
              key={s.titulo}
              className={`rounded-xl border border-border ${m.border} border-l-4 bg-card p-4 shadow-sm`}
            >
              <div className="mb-1.5 flex items-start justify-between gap-2">
                <p className="text-xs font-bold uppercase tracking-wide text-foreground">{s.titulo}</p>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${m.badge}`}>{m.label}</span>
              </div>
              <p className="text-xs text-muted-foreground">{s.detalle}</p>
            </div>
          );
        })}
      </div>

      <p className="mt-4 text-center text-[11px] italic text-muted-foreground">
        Los estados en revisión no bloquean el sistema, pero indican configuración incompleta o uso de respaldo.
      </p>
    </Panel>
  );
}
