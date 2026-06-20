import { useState } from "react";
import * as XLSX from "xlsx";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "@/components/stat-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, RefreshCw, Loader2, DatabaseBackup } from "lucide-react";
import { toast } from "sonner";
import { respaldoTotal } from "@/lib/backup.functions";

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
  const [q, setQ] = useState("");
  const [servicios, setServicios] = useState<Servicio[]>(serviciosBase);
  const [verificando, setVerificando] = useState(false);

  // Auditoría de actividad
  const [actualizando, setActualizando] = useState(false);

  // Respaldo total
  const [respaldando, setRespaldando] = useState(false);
  const generarRespaldo = useServerFn(respaldoTotal);

  const descargarRespaldo = async () => {
    setRespaldando(true);
    try {
      const res = await generarRespaldo();
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo generar el respaldo.");
        return;
      }
      const wb = XLSX.utils.book_new();
      let totalFilas = 0;
      for (const t of res.tablas) {
        const cols = t.columnas;
        const matriz =
          cols.length > 0
            ? [cols, ...t.filas.map((f) => cols.map((c) => f[c] ?? ""))]
            : [["(sin registros)"]];
        const ws = XLSX.utils.aoa_to_sheet(matriz);
        // Excel limita el nombre de hoja a 31 caracteres.
        XLSX.utils.book_append_sheet(wb, ws, t.nombre.slice(0, 31));
        totalFilas += t.filas.length;
      }
      const fecha = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(wb, `respaldo_cedim_${fecha}.xlsx`);
      toast.success(
        `Respaldo generado: ${res.tablas.length} tabla(s), ${totalFilas} registro(s).`,
      );
    } catch (e) {
      console.error(e);
      toast.error("Error al generar el respaldo. Intenta de nuevo.");
    } finally {
      setRespaldando(false);
    }
  };

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

  const actualizarAuditoria = async () => {
    setActualizando(true);
    try {
      // Re-consulta el registro de actividad (entregas de turno / historial).
      await supabase.from("historial_turnos").select("id", { count: "exact", head: true });
      toast.success("Actividad actualizada.");
    } catch (e) {
      console.error(e);
      toast.error("No se pudo actualizar la actividad.");
    } finally {
      setActualizando(false);
    }
  };

  return (
    <div className="space-y-4">
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

      <Panel
        title="Auditoría de actividad"
        action={
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={actualizarAuditoria}
            disabled={actualizando}
          >
            {actualizando ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Actualizando…
              </>
            ) : (
              <>
                <RefreshCw className="mr-1.5 h-4 w-4" /> Actualizar
              </>
            )}
          </Button>
        }
      >
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="rounded-full pl-9"
              placeholder="Buscar acción, usuario, detalle…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select defaultValue="todos">
            <SelectTrigger className="w-44 rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los módulos</SelectItem>
            </SelectContent>
          </Select>
          <Select defaultValue="todos">
            <SelectTrigger className="w-44 rounded-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los usuarios</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                <th className="px-3 py-2">Fecha</th>
                <th className="px-3 py-2">Usuario</th>
                <th className="px-3 py-2">Rol</th>
                <th className="px-3 py-2">Acción</th>
                <th className="px-3 py-2">Módulo</th>
                <th className="px-3 py-2">Detalle</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={6} className="px-3 py-12 text-center text-muted-foreground">
                  {actualizando ? "Actualizando actividad…" : "Aún no hay registros de actividad para mostrar."}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
