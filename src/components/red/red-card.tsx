import {
  Phone,
  Mail,
  MapPin,
  MoreVertical,
  Eye,
  Stethoscope,
  Clock,
  Copy,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  type RedRegistro,
  type TabConfig,
  esActivo,
  ubicacion,
  serviciosList,
} from "@/lib/red-ips-utils";

interface Props {
  reg: RedRegistro;
  tab: TabConfig;
  /** Si el usuario puede marcar disponibilidad (Admin / Operativo activo). */
  canEdit: boolean;
  onView: (r: RedRegistro) => void;
  onToggle: (r: RedRegistro, value: boolean) => void;
}

export function RedCard({ reg, tab, canEdit, onView, onToggle }: Props) {
  const disponible = !!reg.disponible_para_remisiones;
  const activo = esActivo(reg);
  const Icon = tab.icon;
  const servicios = serviciosList(reg);
  const loc = ubicacion(reg);

  const copiar = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast.success("Código copiado");
  };

  return (
    <div
      className={`rounded-2xl border border-border border-l-4 bg-card p-4 shadow-sm transition-shadow hover:shadow-md ${
        disponible ? "border-l-status-green" : "border-l-status-red"
      }`}
    >
      <div className="flex items-start gap-4">
        {/* Ícono institucional */}
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-vitalis-blue/10 text-vitalis-blue">
          <Icon className="h-7 w-7" />
        </div>

        {/* Cuerpo */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-foreground">
                {reg.entidad || "—"}
              </p>

              {/* Línea de servicios / especialidad */}
              {tab.esEspecialista ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-vitalis-blue">
                  <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {reg.servicio_especialidad || "Sin especialidad"}
                  </span>
                </p>
              ) : tab.esAmbulancia ? (
                <p className="mt-0.5 text-sm text-vitalis-blue">
                  {reg.tipo_apoyo || reg.tipo_ambulancia || "Apoyo"}
                </p>
              ) : (
                servicios.length > 0 && (
                  <p className="mt-0.5 text-sm text-vitalis-blue">
                    <span className="font-medium text-muted-foreground">Servicios: </span>
                    {servicios.join(", ")}
                  </p>
                )
              )}
            </div>

            <span
              className={`shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                disponible
                  ? "bg-status-green/15 text-status-green"
                  : "bg-status-red/15 text-status-red"
              }`}
            >
              {disponible ? "● DISPONIBLE" : "● NO DISPONIBLE"}
            </span>
          </div>

          {/* Datos de contacto */}
          <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            {loc && (
              <p className="flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 shrink-0" /> {loc}
              </p>
            )}
            {(reg.telefono || reg.contacto) && (
              <p className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5 shrink-0" /> {reg.telefono || reg.contacto}
              </p>
            )}
            {reg.correo && (
              <p className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{reg.correo}</span>
              </p>
            )}
            {tab.esEspecialista && reg.jornada && (
              <p className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" /> {reg.jornada}
                {reg.horario ? ` · ${reg.horario}` : ""}
              </p>
            )}
          </div>

          {/* Códigos para ambulancias / autorizaciones */}
          {tab.esAmbulancia && (reg.codigo_principal || reg.codigo_alterno) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {reg.codigo_principal && (
                <button
                  type="button"
                  onClick={() => copiar(reg.codigo_principal!)}
                  className="flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground"
                >
                  {reg.codigo_principal} <Copy className="h-3 w-3" />
                </button>
              )}
              {reg.codigo_alterno && (
                <button
                  type="button"
                  onClick={() => copiar(reg.codigo_alterno!)}
                  className="flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground"
                >
                  {reg.codigo_alterno} <Copy className="h-3 w-3" />
                </button>
              )}
            </div>
          )}

          {!activo && (
            <p className="mt-2 inline-block rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
              Registro inactivo
            </p>
          )}
        </div>

        {/* Acciones a la derecha — solo consulta y disponibilidad */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          {canEdit ? (
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-medium text-muted-foreground">
                Marcar disponibilidad
              </span>
              <Switch
                checked={disponible}
                onCheckedChange={(v) => onToggle(reg, v)}
                disabled={!activo}
                className="mt-1"
              />
            </div>
          ) : (
            <span className="max-w-[120px] text-right text-[10px] text-muted-foreground">
              Sin permisos para modificar disponibilidad
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full p-1.5 text-muted-foreground hover:bg-accent">
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onView(reg)}>
                <Eye className="mr-2 h-4 w-4" /> Ver detalle
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
