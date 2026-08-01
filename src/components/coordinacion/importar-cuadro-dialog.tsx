import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Upload, Download, FileSpreadsheet, Loader2, CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { MESES, type ShiftType, type ShiftMember } from "@/lib/cuadro-turno-utils";
import { exportarPlantillaCuadro, importarCuadroExcel } from "@/lib/cuadro-excel";

const DEPENDENCY = "Referencia y Contrarreferencia";

export function ImportarCuadroDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const now = new Date();
  const inputRef = useRef<HTMLInputElement>(null);
  const [anio, setAnio] = useState(now.getFullYear());
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [importando, setImportando] = useState(false);

  const { data: tipos = [] } = useQuery({
    queryKey: ["shift-types"],
    queryFn: async () => {
      const { data } = await supabase.from("shift_types").select("*").order("code");
      return (data ?? []) as unknown as ShiftType[];
    },
  });

  // Personal real del periodo seleccionado (para prellenar la plantilla oficial).
  const { data: personal = [] } = useQuery({
    queryKey: ["cuadro-personal", anio, mes],
    queryFn: async () => {
      const { data: sch } = await supabase
        .from("shift_schedules")
        .select("id")
        .eq("year", anio).eq("month", mes).eq("dependency", DEPENDENCY)
        .maybeSingle();
      if (!sch) return [] as ShiftMember[];
      const { data } = await supabase
        .from("shift_schedule_members")
        .select(
          "id, schedule_id, user_id, full_name, role_name, sede, active, base_hours, pending_hours, notes, sort_order",
        )
        .eq("schedule_id", sch.id)
        .order("sort_order");
      return (data ?? []) as unknown as ShiftMember[];
    },
  });

  const reset = () => {
    setArchivo(null);
    if (inputRef.current) inputRef.current.value = "";
  };
  const cerrar = (v: boolean) => {
    if (!v) reset();
    onOpenChange(v);
  };

  const descargarPlantilla = async () => {
    try {
      await exportarPlantillaCuadro({ anio, mes, members: personal, days: [], tipos });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo generar la plantilla.");
    }
  };

  const importar = async () => {
    if (!archivo || !user) return;
    setImportando(true);
    try {
      // 1) Asegurar que exista el cuadro (schedule) del periodo seleccionado.
      let { data: schedule } = await supabase
        .from("shift_schedules")
        .select("*")
        .eq("year", anio).eq("month", mes).eq("dependency", DEPENDENCY)
        .maybeSingle();
      if (!schedule) {
        const { data: nuevo, error } = await supabase
          .from("shift_schedules")
          .insert({ year: anio, month: mes, dependency: DEPENDENCY, base_hours: 176, status: "borrador", created_by: user.id })
          .select("*").single();
        if (error || !nuevo) {
          toast.error("No se pudo preparar el cuadro del periodo.");
          return;
        }
        schedule = nuevo;
      }
      // 2) Miembros actuales del cuadro.
      const { data: members } = await supabase
        .from("shift_schedule_members")
        .select(
          "id, schedule_id, user_id, full_name, role_name, sede, active, base_hours, pending_hours, notes, sort_order",
        )
        .eq("schedule_id", schedule.id).order("sort_order");

      const r = await importarCuadroExcel({
        file: archivo,
        scheduleId: schedule.id,
        anio, mes,
        members: (members ?? []) as unknown as ShiftMember[],
        tipos,
        userId: user.id,
      });
      registrarAuditoria({ data: { accion: "CUADRO_IMPORTADO", modulo: "cuadro_turno", tabla: "shift_schedule_days", registroId: schedule.id, resultado: "exito", detalles: { anio, mes, ...r } } }).catch(() => {});
      let msg = `Importado: ${r.miembrosNuevos} nuevo(s), ${r.diasCargados} día(s).`;
      if (r.codigosDesconocidos.length) msg += ` Códigos no reconocidos: ${r.codigosDesconocidos.join(", ")}.`;
      toast.success(msg);
      qc.invalidateQueries({ queryKey: ["schedule"] });
      qc.invalidateQueries({ queryKey: ["schedule-members"] });
      qc.invalidateQueries({ queryKey: ["schedule-days"] });
      cerrar(false);
    } catch (err: any) {
      console.error(err);
      toast.error(err?.message || "No se pudo importar el archivo.");
    } finally {
      setImportando(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={cerrar}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" /> CUADRO DE TURNO
          </DialogTitle>
          <DialogDescription>
            Descarga la plantilla base del cuadro de turno (TH-FR-10), diligénciala y súbela
            nuevamente para importar la programación mensual. Los encabezados deben coincidir con la
            plantilla.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <Label className="text-xs">Año</Label>
              <Input type="number" className="w-24" value={anio} onChange={(e) => setAnio(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Mes</Label>
              <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MESES.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button variant="outline" size="sm" className="rounded-full" onClick={descargarPlantilla}>
            <Download className="mr-1.5 h-4 w-4" /> Descargar plantilla
          </Button>

          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xlsm,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setArchivo(f);
            }}
          />

          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 px-4 py-8 text-center transition hover:border-primary/50 hover:bg-muted/50"
          >
            {archivo ? (
              <>
                <FileSpreadsheet className="h-8 w-8 text-status-green" />
                <p className="text-sm font-semibold text-foreground">{archivo.name}</p>
                <span className="text-xs text-primary underline">Cambiar archivo</span>
              </>
            ) : (
              <>
                <Upload className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm font-semibold text-foreground">Selecciona un archivo</p>
                <p className="text-xs text-muted-foreground">.xlsx · .xlsm · .csv</p>
              </>
            )}
          </button>
          <p className="text-[11px] text-muted-foreground">
            La importación crea o actualiza la programación del periodo seleccionado. No borra los
            colaboradores ni los turnos ya existentes.
          </p>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => cerrar(false)} disabled={importando}>
            Cancelar
          </Button>
          <Button onClick={importar} disabled={!archivo || importando}>
            {importando ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Importando…
              </>
            ) : (
              <>Importar</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
