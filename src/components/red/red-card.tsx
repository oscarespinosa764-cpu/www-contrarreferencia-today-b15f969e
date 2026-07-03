import {
  Phone,
  Mail,
  MapPin,
  MoreVertical,
  Eye,
  Pencil,
  Stethoscope,
  Clock,
  Copy,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import {
  type RedRegistro,
  type GrupoConfig,
  esActivo,
  ubicacion,
  serviciosList,
} from "@/lib/red-ips-utils";

interface Props {
  reg: RedRegistro;
  grupo: GrupoConfig;
  /** Si el usuario puede editar (Admin). */
  canEdit: boolean;
  onView: (r: RedRegistro) => void;
  onEdit?: (r: RedRegistro) => void;
}

export function RedCard({ reg, grupo, canEdit, onView, onEdit }: Props) {
  const activo = esActivo(reg);
  const Icon = grupo.icon;
  const servicios = serviciosList(reg);
  const loc = ubicacion(reg);

  const esEspecialidad = grupo.key === "especialidades_cedim";
  const esAmbulancia = grupo.key === "ambulancias";
  const esTep = grupo.key === "jornadas_tep";
  const esCodigoTep = reg.tipo_red === "codigo_tep";

  const copiar = (txt: string) => {
    navigator.clipboard.writeText(txt);
    toast.success("Copiado");
  };

  return (
    <div className="rounded-2xl border border-border border-l-4 border-l-vitalis-blue bg-card p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-4">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-vitalis-blue/10 text-vitalis-blue">
          <Icon className="h-7 w-7" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-[15px] font-bold text-foreground">
                {esCodigoTep ? reg.empresa_tep || reg.entidad || "—" : reg.entidad || "—"}
              </p>

              {esEspecialidad ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-vitalis-blue">
                  <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {reg.servicio_especialidad || "Sin especialidad"}
                  </span>
                </p>
              ) : esAmbulancia ? (
                <p className="mt-0.5 text-sm text-vitalis-blue">
                  {reg.tipo_ambulancia || reg.tipo_apoyo || "Ambulancia"}
                </p>
              ) : esCodigoTep ? (
                <p className="mt-0.5 text-sm text-vitalis-blue">
                  {reg.tipo_ambulancia || ""}
                  {reg.cups ? ` · CUPS ${reg.cups}` : ""}
                </p>
              ) : esTep ? (
                <p className="mt-0.5 flex items-center gap-1.5 text-sm text-vitalis-blue">
                  <Stethoscope className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{reg.servicio_especialidad || "Jornada"}</span>
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
          </div>

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
            {reg.eapb_aseguradoras && (
              <p className="truncate">
                <span className="font-medium">EAPB: </span>
                {reg.eapb_aseguradoras}
              </p>
            )}
            {(esEspecialidad || esTep) && reg.jornada && (
              <p className="flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5 shrink-0" /> {reg.jornada}
                {reg.horario ? ` · ${reg.horario}` : ""}
              </p>
            )}
            {esTep && (reg.fecha_inicio || reg.fecha_final) && (
              <p className="truncate">
                <span className="font-medium">Vigencia: </span>
                {[reg.fecha_inicio, reg.fecha_final].filter(Boolean).join(" → ")}
              </p>
            )}
            {reg.recorrido && (
              <p className="truncate">
                <span className="font-medium">Recorrido: </span>
                {reg.recorrido}
              </p>
            )}
          </div>

          {esCodigoTep && reg.cups && (
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => copiar(reg.cups!)}
                className="flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground"
              >
                CUPS {reg.cups} <Copy className="h-3 w-3" />
              </button>
            </div>
          )}

          {!activo && (
            <p className="mt-2 inline-block rounded bg-muted px-2 py-0.5 text-[10px] font-bold uppercase text-muted-foreground">
              Registro inactivo
            </p>
          )}
        </div>

        {/* Acciones: ver / editar */}
        <div className="shrink-0">
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full p-1.5 text-muted-foreground hover:bg-accent">
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onView(reg)}>
                <Eye className="mr-2 h-4 w-4" /> Ver detalle
              </DropdownMenuItem>
              {canEdit && onEdit && (
                <DropdownMenuItem onClick={() => onEdit(reg)}>
                  <Pencil className="mr-2 h-4 w-4" /> Editar
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}
