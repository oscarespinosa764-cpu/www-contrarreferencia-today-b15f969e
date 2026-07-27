import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { Panel } from "@/components/stat-card";
import { FiltersBar, countActiveFilters } from "@/components/filters/filters-bar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, UserPlus, Loader2, Activity, Pencil, Eye, EyeOff, Copy, KeyRound, ShieldAlert, Mail, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import {
  crearUsuario,
  cambiarRolUsuario,
  cambiarEstadoUsuario,
  editarUsuario,
  obtenerEmailUsuario,
  cambiarEmailUsuario,
  cambiarPasswordUsuario,
  generarPasswordTemporalUsuario,
  invitarUsuario,
  reenviarInvitacion,
  enviarResetPasswordUsuario,
  obtenerEstadoAccesoUsuario,
} from "@/lib/usuarios.functions";
import { UsuarioActividadDialog } from "@/components/coordinacion/usuario-actividad-dialog";
import { FirmaFuncionarioSection } from "@/components/coordinacion/firma-funcionario-section";

type Rol = "admin" | "operativa" | "temporal";

const rolLabels: Record<Rol, string> = {
  admin: "Administrador",
  operativa: "Operativa",
  temporal: "Acceso temporal",
};

const rolBadge: Record<Rol, string> = {
  admin: "bg-status-red/15 text-status-red",
  operativa: "bg-status-blue/15 text-status-blue",
  temporal: "bg-status-amber/15 text-status-amber",
};

const emptyForm = {
  nombre: "",
  email: "",
  cargo: "",
  telefono: "",
  rol: "operativa" as Rol,
  activo: true,
};

const fmtFecha = (iso: string | null | undefined) => {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
};

type AllowedAction =
  | "COPY_USER" | "RESEND_INVITATION" | "SEND_RESET"
  | "CHANGE_PASSWORD_MANUAL" | "GENERATE_TEMP_PASSWORD"
  | "ACTIVATE_ACCOUNT" | "REVIEW_BLOCK";

type EstadoAcceso = {
  email: string | null;
  normalizedStatus: "ACTIVE" | "INVITATION_PENDING" | "INACTIVE" | "BLOCKED" | "PROFILE_WITHOUT_AUTH" | "AUTH_ERROR";
  estadoCuenta: string;
  estadoPassword: string;
  activationAt: string | null;
  lastAdminChangeAt: string | null;
  lastResetSentAt: string | null;
  lastResetStatus: string | null;
  resetInFlight: boolean;
  allowedActions: AllowedAction[];
};



type EditForm = {
  userId: string;
  nombre: string;
  email: string;
  cargo: string;
  tipo_documento: string;
  numero_documento: string;
  telefono: string;
  sede: string;
  observaciones: string;
  rol: Rol;
  activo: boolean;
  esYo: boolean;
};

export function UsuariosPanel() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filtroRol, setFiltroRol] = useState<"todos" | Rol>("todos");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [guardando, setGuardando] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [editando, setEditando] = useState(false);
  const [emailOriginal, setEmailOriginal] = useState<string>("");
  const [emailCargando, setEmailCargando] = useState(false);
  const [nuevoPass, setNuevoPass] = useState("");
  const [confirmarPass, setConfirmarPass] = useState("");
  const [mostrarPass, setMostrarPass] = useState(false);
  const [guardandoPass, setGuardandoPass] = useState(false);
  const [credencialesOpen, setCredencialesOpen] = useState(false);
  const [tempPass, setTempPass] = useState<string | null>(null);
  const [generandoTemp, setGenerandoTemp] = useState(false);
  const [confirmGenerar, setConfirmGenerar] = useState(false);
  const [estadoAcceso, setEstadoAcceso] = useState<EstadoAcceso | null>(null);
  const [estadoCargando, setEstadoCargando] = useState(false);
  const [mostrarCambioManual, setMostrarCambioManual] = useState(false);
  const [enviandoReset, setEnviandoReset] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [confirmDesactivar, setConfirmDesactivar] = useState<{
    userId: string;
    nombre: string;
    activo: boolean;
  } | null>(null);
  const [actividadDe, setActividadDe] = useState<{
    userId: string;
    nombre: string;
    email: string | null;
  } | null>(null);

  const crear = useServerFn(crearUsuario);
  const invitarFn = useServerFn(invitarUsuario);
  const reenviarFn = useServerFn(reenviarInvitacion);
  const resetLinkFn = useServerFn(enviarResetPasswordUsuario);
  const estadoAccesoFn = useServerFn(obtenerEstadoAccesoUsuario);
  const cambiarRolFn = useServerFn(cambiarRolUsuario);
  const cambiarEstadoFn = useServerFn(cambiarEstadoUsuario);
  const editarFn = useServerFn(editarUsuario);
  const obtenerEmailFn = useServerFn(obtenerEmailUsuario);
  const cambiarEmailFn = useServerFn(cambiarEmailUsuario);
  const cambiarPassFn = useServerFn(cambiarPasswordUsuario);
  const generarTempFn = useServerFn(generarPasswordTemporalUsuario);
  void crear; // legado: reemplazado por invitación


  const { data: usuarios, isLoading } = useQuery({
    queryKey: ["usuarios"],
    enabled: isAdmin,
    queryFn: async () => {
      const [{ data: profiles }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at"),
        supabase.from("user_roles").select("user_id, role"),
      ]);
      const rolesByUser: Record<string, Rol[]> = {};
      (roles ?? []).forEach((r) => {
        (rolesByUser[r.user_id] ??= []).push(r.role as Rol);
      });
      return (profiles ?? []).map((p) => ({ ...p, roles: rolesByUser[p.user_id] ?? [] }));
    },
  });

  // Cargar estado de acceso al abrir el modal
  useEffect(() => {
    let cancel = false;
    if (!credencialesOpen || !editForm) return;
    setEstadoAcceso(null);
    setEstadoCargando(true);
    (async () => {
      try {
        const res = await estadoAccesoFn({ data: { userId: editForm.userId } });
        if (cancel) return;
        if (res.ok && res.info) setEstadoAcceso(res.info);
      } finally {
        if (!cancel) setEstadoCargando(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [credencialesOpen, editForm, estadoAccesoFn]);

  const recargarEstadoAcceso = async () => {
    if (!editForm) return;
    setEstadoCargando(true);
    try {
      const res = await estadoAccesoFn({ data: { userId: editForm.userId } });
      if (res.ok && res.info) setEstadoAcceso(res.info);
    } finally {
      setEstadoCargando(false);
    }
  };

  const restablecimientoPendiente = estadoAcceso?.resetInFlight === true;
  const puede = (a: AllowedAction) => estadoAcceso?.allowedActions?.includes(a) ?? false;

  const handleReenviarInvitacion = async () => {
    if (!editForm) return;
    setReenviando(true);
    try {
      const res = await reenviarFn({ data: { userId: editForm.userId } });
      if (!res.ok) return toast.error(res.error ?? "No fue posible reenviar la invitación.");
      toast.success("Invitación reenviada al correo del usuario.");
      recargarEstadoAcceso();
    } finally {
      setReenviando(false);
    }
  };

  const handleEnviarResetLink = async () => {
    if (!editForm) return;
    setEnviandoReset(true);
    try {
      const res = await resetLinkFn({ data: { userId: editForm.userId } });
      if (!res.ok) return toast.error(res.error ?? "No fue posible enviar el enlace.");
      toast.success("Solicitud de restablecimiento registrada. El correo está en proceso de envío.");
      await recargarEstadoAcceso();
    } finally {
      setEnviandoReset(false);
    }
  };



  const cambiarRol = async (userId: string, nuevoRol: Rol) => {
    const res = await cambiarRolFn({ data: { userId, rol: nuevoRol } });
    if (!res.ok) return toast.error(res.error ?? "No se pudo actualizar el rol.");
    toast.success("Rol actualizado");
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  };

  const toggleActivo = async (userId: string, activo: boolean) => {
    const res = await cambiarEstadoFn({ data: { userId, activo } });
    if (!res.ok) return toast.error(res.error ?? "No se pudo actualizar el estado.");
    toast.success(activo ? "Usuario activado correctamente." : "Usuario desactivado correctamente.");
    // Invalidar todas las query keys que dependen de la lista de usuarios activos
    // para que los selectores operativos reflejen el cambio sin recargar.
    qc.invalidateQueries({ queryKey: ["usuarios"] });
    qc.invalidateQueries({ queryKey: ["auxiliares-turno"] });
    qc.invalidateQueries({ queryKey: ["funcionarios"] });
    qc.invalidateQueries({ queryKey: ["funcionarios-activos"] });
    qc.invalidateQueries({ queryKey: ["profiles"] });
    qc.invalidateQueries({ queryKey: ["personal"] });
    qc.invalidateQueries({ queryKey: ["responsables"] });
    qc.invalidateQueries({ queryKey: ["coordinadores"] });
    qc.invalidateQueries({ queryKey: ["cuadro-turno-personal"] });
    qc.invalidateQueries({ queryKey: ["shift-schedule-members"] });
  };

  const confirmarDesactivacion = async () => {
    if (!confirmDesactivar) return;
    const { userId, activo } = confirmDesactivar;
    setConfirmDesactivar(null);
    await toggleActivo(userId, activo);
  };

  const abrirEditar = (u: {
    user_id: string;
    nombre: string | null;
    cargo: string | null;
    tipo_documento: string | null;
    numero_documento: string | null;
    telefono: string | null;
    sede: string | null;
    observaciones: string | null;
    activo: boolean;
    roles: Rol[];
  }) => {
    setEditForm({
      userId: u.user_id,
      nombre: u.nombre || "",
      email: "",
      cargo: u.cargo || "",
      tipo_documento: u.tipo_documento || "",
      numero_documento: u.numero_documento || "",
      telefono: u.telefono || "",
      sede: u.sede || "",
      observaciones: u.observaciones || "",
      rol: (u.roles[0] ?? "operativa") as Rol,
      activo: u.activo,
      esYo: u.user_id === user?.id,
    });
    setEmailOriginal("");
    setNuevoPass("");
    setConfirmarPass("");
    setMostrarPass(false);
    setTempPass(null);
    setEmailCargando(true);
    obtenerEmailFn({ data: { userId: u.user_id } })
      .then((res) => {
        if (res.ok && res.email) {
          setEmailOriginal(res.email);
          setEditForm((f) => (f ? { ...f, email: res.email ?? "" } : f));
        }
      })
      .catch(() => {})
      .finally(() => setEmailCargando(false));
  };

  const cambiarPassword = async () => {
    if (!editForm) return;
    if (nuevoPass !== confirmarPass) return toast.error("Las contraseñas no coinciden.");
    if (nuevoPass.length < 10) return toast.error("Mínimo 10 caracteres.");
    if (!/[A-Z]/.test(nuevoPass) || !/[a-z]/.test(nuevoPass) || !/[0-9]/.test(nuevoPass) || !/[^A-Za-z0-9]/.test(nuevoPass)) {
      return toast.error("Debe incluir mayúsculas, minúsculas, un número y un símbolo.");
    }
    setGuardandoPass(true);
    try {
      const res = await cambiarPassFn({ data: { userId: editForm.userId, password: nuevoPass } });
      if (!res.ok) {
        toast.error(res.error ?? "No fue posible actualizar la contraseña.");
        return;
      }
      toast.success("Contraseña actualizada correctamente.");
      setNuevoPass("");
      setConfirmarPass("");
      setMostrarPass(false);
    } finally {
      setGuardandoPass(false);
    }
  };

  const generarTemporal = async () => {
    if (!editForm) return;
    setGenerandoTemp(true);
    try {
      const res = await generarTempFn({ data: { userId: editForm.userId } });
      if (!res.ok || !res.password) {
        toast.error(res.error ?? "No fue posible generar la contraseña temporal.");
        return;
      }
      setTempPass(res.password);
      toast.success("Contraseña temporal generada.");
    } finally {
      setGenerandoTemp(false);
      setConfirmGenerar(false);
    }
  };

  const copiar = async (txt: string, label: string) => {
    try {
      await navigator.clipboard.writeText(txt);
      toast.success(`${label} copiado al portapapeles.`);
    } catch {
      toast.error("No se pudo copiar.");
    }
  };

  const guardarEdicion = async () => {
    if (!editForm) return;
    if (!editForm.nombre.trim()) return toast.error("Ingresa el nombre.");
    setEditando(true);
    try {
      // Si el correo cambió, actualízalo primero.
      const emailNuevo = editForm.email.trim().toLowerCase();
      if (emailNuevo && emailNuevo !== emailOriginal.toLowerCase()) {
        const resE = await cambiarEmailFn({ data: { userId: editForm.userId, email: emailNuevo } });
        if (!resE.ok) {
          toast.error(resE.error ?? "No fue posible actualizar el correo.");
          setEditando(false);
          return;
        }
        setEmailOriginal(emailNuevo);
      }
      const res = await editarFn({
        data: {
          userId: editForm.userId,
          nombre: editForm.nombre.trim(),
          cargo: editForm.cargo.trim(),
          tipo_documento: editForm.tipo_documento.trim(),
          numero_documento: editForm.numero_documento.trim(),
          telefono: editForm.telefono.trim(),
          sede: editForm.sede.trim(),
          observaciones: editForm.observaciones.trim(),
          rol: editForm.esYo ? undefined : editForm.rol,
          activo: editForm.esYo ? undefined : editForm.activo,
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo actualizar el usuario.");
        return;
      }
      toast.success("Usuario actualizado correctamente.");
      setEditForm(null);
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch {
      toast.error("Error al actualizar el usuario. Intenta de nuevo.");
    } finally {
      setEditando(false);
    }
  };

  const guardarNuevo = async () => {
    if (!form.nombre.trim()) return toast.error("Ingresa el nombre.");
    if (!form.email.trim()) return toast.error("Ingresa el correo.");
    setGuardando(true);
    try {
      const res = await invitarFn({
        data: {
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          cargo: form.cargo.trim(),
          telefono: form.telefono.trim(),
          rol: form.rol,
          activo: form.activo,
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo enviar la invitación.");
        return;
      }
      toast.success("Invitación enviada. El usuario recibirá un correo para activar su cuenta.");
      setForm(emptyForm);
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch {
      toast.error("Error al enviar la invitación. Intenta de nuevo.");
    } finally {
      setGuardando(false);
    }
  };


  const term = q.trim().toLowerCase();
  const filtrados = useMemo(
    () =>
      (usuarios ?? []).filter((u) => {
        const rol = (u.roles[0] ?? "operativa") as Rol;
        if (filtroRol !== "todos" && rol !== filtroRol) return false;
        if (!term) return true;
        return [u.nombre, u.numero_documento, u.cargo, rolLabels[rol]]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(term);
      }),
    [usuarios, term, filtroRol],
  );

  if (!isAdmin) {
    return (
      <Panel>
        <p className="py-8 text-center text-sm text-muted-foreground">
          Solo el administrador puede gestionar usuarios.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Usuarios internos"
      action={
        <Button size="sm" className="rounded-full" onClick={() => setDialogOpen(true)}>
          <UserPlus className="mr-1.5 h-4 w-4" /> Nuevo usuario
        </Button>
      }
    >
      <FiltersBar
        className="mb-4"
        activeCount={countActiveFilters({ q, filtroRol }, { q: "", filtroRol: "todos" })}
        onClear={() => { setQ(""); setFiltroRol("todos"); }}
        primary={
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="rounded-full pl-9"
              placeholder="Buscar nombre, documento, cargo…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        }
        secondary={
          <Select value={filtroRol} onValueChange={(v) => setFiltroRol(v as typeof filtroRol)}>
            <SelectTrigger className="w-full rounded-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los roles</SelectItem>
              {(Object.keys(rolLabels) as Rol[]).map((r) => (
                <SelectItem key={r} value={r}>
                  {rolLabels[r]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />


      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border text-left text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <th className="px-3 py-2">Documento</th>
              <th className="px-3 py-2">Nombre</th>
              <th className="px-3 py-2">Cargo</th>
              <th className="px-3 py-2">Rol</th>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Cargando…
                </td>
              </tr>
            ) : filtrados.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-muted-foreground">
                  Sin resultados.
                </td>
              </tr>
            ) : (
              filtrados.map((u) => {
                const rol = (u.roles[0] ?? "operativa") as Rol;
                const sinRol = u.roles.length === 0;
                const esYo = u.user_id === user?.id;
                return (
                  <tr key={u.id} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-3 text-muted-foreground">{u.numero_documento || "—"}</td>
                    <td className="px-3 py-3 font-semibold text-foreground">
                      {u.nombre || "Sin nombre"}
                      {esYo && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(tú)</span>}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">{u.cargo || "—"}</td>
                    <td className="px-3 py-3">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${
                          sinRol ? "bg-muted text-muted-foreground" : rolBadge[rol]
                        }`}
                      >
                        {sinRol ? "Sin rol" : rolLabels[rol]}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`text-xs font-semibold ${u.activo ? "text-status-green" : "text-muted-foreground"}`}
                      >
                        ● {u.activo ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Select
                          value={sinRol ? undefined : rol}
                          onValueChange={(v) => cambiarRol(u.user_id, v as Rol)}
                          disabled={esYo}
                        >
                          <SelectTrigger className="h-8 w-40 rounded-full text-xs">
                            <SelectValue placeholder="Asignar rol" />
                          </SelectTrigger>
                          <SelectContent>
                            {(Object.keys(rolLabels) as Rol[]).map((r) => (
                              <SelectItem key={r} value={r}>
                                {rolLabels[r]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full"
                          onClick={() => abrirEditar(u)}
                        >
                          <Pencil className="mr-1 h-4 w-4" /> Editar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full"
                          onClick={() =>
                            setActividadDe({
                              userId: u.user_id,
                              nombre: u.nombre || "Sin nombre",
                              email: null,
                            })
                          }
                        >
                          <Activity className="mr-1 h-4 w-4" /> Actividad
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 rounded-full"
                          disabled={esYo}
                          onClick={() =>
                            esYo
                              ? toast.error("No puedes desactivar tu propio usuario.")
                              : setConfirmDesactivar({
                                  userId: u.user_id,
                                  nombre: u.nombre || "Sin nombre",
                                  activo: !u.activo,
                                })
                          }
                        >
                          {u.activo ? "Desactivar" : "Activar"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(v) => !guardando && setDialogOpen(v)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
            <DialogDescription>
              El administrador asigna el correo y la contraseña inicial. El usuario no podrá
              registrarse ni cambiar su contraseña por su cuenta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="n-nombre">Nombre completo</Label>
              <Input
                id="n-nombre"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre del usuario"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-email">Correo institucional</Label>
              <Input
                id="n-email"
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="nombre@cedimips.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-cargo">Cargo (opcional)</Label>
              <Input
                id="n-cargo"
                value={form.cargo}
                onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))}
                placeholder="Cargo o área"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="n-tel">Número telefónico (opcional)</Label>
              <Input
                id="n-tel"
                type="tel"
                inputMode="tel"
                value={form.telefono}
                onChange={(e) => setForm((f) => ({ ...f, telefono: e.target.value }))}
                placeholder="+57 300 000 0000"
              />
            </div>
            <div className="rounded-md border border-status-blue/30 bg-status-blue/5 p-3 text-xs text-muted-foreground">
              <div className="flex items-start gap-2">
                <Mail className="h-4 w-4 mt-0.5 text-status-blue shrink-0" />
                <div>
                  Se enviará un correo de invitación a este usuario para que active su cuenta y establezca su contraseña.
                  El administrador NO define la contraseña inicial.
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Rol</Label>
                <Select
                  value={form.rol}
                  onValueChange={(v) => setForm((f) => ({ ...f, rol: v as Rol }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(rolLabels) as Rol[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {rolLabels[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select
                  value={form.activo ? "activo" : "inactivo"}
                  onValueChange={(v) => setForm((f) => ({ ...f, activo: v === "activo" }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="inactivo">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={guardando}>
              Cancelar
            </Button>
            <Button onClick={guardarNuevo} disabled={guardando}>
              {guardando ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Enviando…
                </>
              ) : (
                "Enviar invitación"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar usuario */}
      <Dialog open={Boolean(editForm)} onOpenChange={(v) => !editando && !v && setEditForm(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
            <DialogDescription>
              Actualiza los datos de perfil del usuario. El correo de autenticación no se puede
              modificar desde aquí.
            </DialogDescription>
          </DialogHeader>

          {editForm && (
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              <div className="space-y-1.5">
                <Label htmlFor="e-nombre">Nombre completo</Label>
                <Input
                  id="e-nombre"
                  value={editForm.nombre}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, nombre: e.target.value } : f))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="e-tdoc">Tipo de documento</Label>
                  <Input
                    id="e-tdoc"
                    value={editForm.tipo_documento}
                    onChange={(e) =>
                      setEditForm((f) => (f ? { ...f, tipo_documento: e.target.value } : f))
                    }
                    placeholder="CC, CE…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-ndoc">Número de documento</Label>
                  <Input
                    id="e-ndoc"
                    value={editForm.numero_documento}
                    onChange={(e) =>
                      setEditForm((f) => (f ? { ...f, numero_documento: e.target.value } : f))
                    }
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-cargo">Cargo</Label>
                <Input
                  id="e-cargo"
                  value={editForm.cargo}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, cargo: e.target.value } : f))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="e-tel">Teléfono</Label>
                  <Input
                    id="e-tel"
                    type="tel"
                    inputMode="tel"
                    value={editForm.telefono}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, telefono: e.target.value } : f))}
                    placeholder="+57 300 000 0000"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-sede">Sede</Label>
                  <Input
                    id="e-sede"
                    value={editForm.sede}
                    onChange={(e) => setEditForm((f) => (f ? { ...f, sede: e.target.value } : f))}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-obs">Observaciones</Label>
                <Input
                  id="e-obs"
                  value={editForm.observaciones}
                  onChange={(e) =>
                    setEditForm((f) => (f ? { ...f, observaciones: e.target.value } : f))
                  }
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Rol</Label>
                  <Select
                    value={editForm.rol}
                    onValueChange={(v) => setEditForm((f) => (f ? { ...f, rol: v as Rol } : f))}
                    disabled={editForm.esYo}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(rolLabels) as Rol[]).map((r) => (
                        <SelectItem key={r} value={r}>
                          {rolLabels[r]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Estado</Label>
                  <Select
                    value={editForm.activo ? "activo" : "inactivo"}
                    onValueChange={(v) =>
                      setEditForm((f) => (f ? { ...f, activo: v === "activo" } : f))
                    }
                    disabled={editForm.esYo}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="activo">Activo</SelectItem>
                      <SelectItem value="inactivo">Inactivo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="e-email">Correo de autenticación</Label>
                <Input
                  id="e-email"
                  type="email"
                  value={editForm.email}
                  disabled={emailCargando}
                  onChange={(e) => setEditForm((f) => (f ? { ...f, email: e.target.value } : f))}
                  placeholder={emailCargando ? "Cargando…" : "correo@dominio.com"}
                />
                <p className="text-[11px] text-muted-foreground">
                  Al cambiarlo, el usuario deberá iniciar sesión con el nuevo correo. La acción queda auditada.
                </p>
              </div>

              <p className="text-[11px] text-muted-foreground">
                Para gestionar la contraseña (enlace de restablecimiento, cambio manual o clave temporal), abre "Datos básicos de acceso".
              </p>

              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="w-full rounded-full"
                onClick={() => setCredencialesOpen(true)}
              >
                <ShieldAlert className="mr-1.5 h-4 w-4" /> Datos básicos de acceso
              </Button>

              {editForm.esYo && (
                <p className="rounded-md bg-status-amber/10 px-3 py-2 text-[11px] font-medium text-status-amber">
                  No puedes cambiar tu propio rol ni tu propio estado.
                </p>
              )}
              <FirmaFuncionarioSection userId={editForm.userId} nombre={editForm.nombre} />
            </div>
          )}

          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditForm(null)} disabled={editando}>
              Cancelar
            </Button>
            <Button onClick={guardarEdicion} disabled={editando}>
              {editando ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Guardando…
                </>
              ) : (
                "Guardar cambios"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmación activar / desactivar */}
      <Dialog open={Boolean(confirmDesactivar)} onOpenChange={(v) => !v && setConfirmDesactivar(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {confirmDesactivar?.activo ? "Activar usuario" : "Desactivar usuario"}
            </DialogTitle>
            <DialogDescription>
              {confirmDesactivar?.activo
                ? `¿Confirmas activar a ${confirmDesactivar?.nombre}?`
                : `¿Confirmas desactivar a ${confirmDesactivar?.nombre}? El usuario no se elimina y puede reactivarse después.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDesactivar(null)}>
              Cancelar
            </Button>
            <Button onClick={confirmarDesactivacion}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Datos básicos de acceso */}
      <Dialog
        open={credencialesOpen}
        onOpenChange={(v) => {
          if (!v) {
            setCredencialesOpen(false);
            setTempPass(null);
            setConfirmGenerar(false);
            setMostrarCambioManual(false);
            setNuevoPass("");
            setConfirmarPass("");
            setEstadoAcceso(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Datos básicos de acceso</DialogTitle>
            <DialogDescription>
              Gestión segura de credenciales. La contraseña actual nunca es consultable.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[65vh] overflow-y-auto pr-1 space-y-3">
            {estadoCargando && !estadoAcceso ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin mr-2" /> Cargando estado de acceso…
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-md border border-border/60 bg-muted/30 p-2">
                    <div className="text-[10px] uppercase text-muted-foreground">Estado cuenta</div>
                    <div className="text-sm font-semibold">{estadoAcceso?.estadoCuenta ?? "—"}</div>
                  </div>
                  <div className="rounded-md border border-border/60 bg-muted/30 p-2">
                    <div className="text-[10px] uppercase text-muted-foreground">Estado contraseña</div>
                    <div className="text-sm font-semibold">{estadoAcceso?.estadoPassword ?? "—"}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                  <div>Activación: <span className="text-foreground">{fmtFecha(estadoAcceso?.activationAt)}</span></div>
                  <div>Últ. cambio admin: <span className="text-foreground">{fmtFecha(estadoAcceso?.lastAdminChangeAt)}</span></div>
                  <div className="col-span-2">Últ. enlace de restablecimiento: <span className="text-foreground">{fmtFecha(estadoAcceso?.lastResetSentAt)}</span></div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Correo de autenticación</Label>
                  <div className="flex items-center gap-2">
                    <Input value={emailOriginal || estadoAcceso?.email || "—"} readOnly />
                    {(emailOriginal || estadoAcceso?.email) && (
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => copiar(emailOriginal || estadoAcceso?.email || "", "Correo")}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>

                {tempPass && (
                  <div className="rounded-lg border border-status-amber/40 bg-status-amber/10 p-3 space-y-1">
                    <Label className="text-xs">Contraseña temporal generada</Label>
                    <div className="flex items-center gap-2">
                      <Input value={tempPass} readOnly className="font-mono" />
                      <Button size="icon" variant="outline" onClick={() => copiar(tempPass, "Contraseña")}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <p className="text-[11px] font-semibold text-status-amber">
                      Cópiala ahora y comunícasela al usuario por un canal seguro. Al cerrar esta ventana no volverá a mostrarse.
                    </p>
                  </div>
                )}

                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2">
                  <div className="text-xs font-semibold uppercase text-muted-foreground">Acciones administrativas</div>

                  {puede("RESEND_INVITATION") && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start rounded-md"
                      onClick={handleReenviarInvitacion}
                      disabled={reenviando}
                    >
                      {reenviando ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
                      Reenviar invitación de activación
                    </Button>
                  )}

                  {puede("SEND_RESET") && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start rounded-md"
                      onClick={handleEnviarResetLink}
                      disabled={enviandoReset || restablecimientoPendiente}
                    >
                      {enviandoReset ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
                      {restablecimientoPendiente ? "Restablecimiento en proceso" : "Enviar enlace de restablecimiento"}
                    </Button>
                  )}

                  {estadoAcceso?.normalizedStatus === "INACTIVE" && (
                    <div className="rounded-md border border-status-amber/40 bg-status-amber/10 p-2 text-xs">
                      La cuenta está inactiva. Actívala desde la tabla de usuarios antes de gestionar credenciales.
                    </div>
                  )}
                  {estadoAcceso?.normalizedStatus === "BLOCKED" && (
                    <div className="rounded-md border border-status-red/40 bg-status-red/10 p-2 text-xs">
                      La cuenta está bloqueada. Revisa su estado en Auth antes de enviar enlaces.
                    </div>
                  )}
                  {estadoAcceso?.normalizedStatus === "PROFILE_WITHOUT_AUTH" && (
                    <div className="rounded-md border border-status-red/40 bg-status-red/10 p-2 text-xs">
                      Este perfil no tiene una cuenta de acceso vinculada.
                    </div>
                  )}
                  {estadoAcceso?.lastResetStatus && ["failed", "dlq", "bounced"].includes(estadoAcceso.lastResetStatus) && puede("SEND_RESET") && (
                    <div className="rounded-md border border-status-red/40 bg-status-red/10 p-2 text-[11px]">
                      El último intento de restablecimiento no pudo enviarse ({estadoAcceso.lastResetStatus}). Puedes reintentar.
                    </div>
                  )}

                  {puede("CHANGE_PASSWORD_MANUAL") && (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start rounded-md"
                      onClick={() => setMostrarCambioManual((v) => !v)}
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      Cambiar contraseña manualmente
                    </Button>
                  )}

                  {mostrarCambioManual && puede("CHANGE_PASSWORD_MANUAL") && (
                    <div className="rounded-md border border-border/60 bg-background p-3 space-y-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="cm-pass">Nueva contraseña</Label>
                        <div className="relative">
                          <Input
                            id="cm-pass"
                            type={mostrarPass ? "text" : "password"}
                            value={nuevoPass}
                            onChange={(e) => setNuevoPass(e.target.value)}
                            placeholder="Mín. 10, Mayús/minús/número/símbolo"
                            className="pr-9"
                          />
                          <button
                            type="button"
                            onClick={() => setMostrarPass((v) => !v)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                            aria-label={mostrarPass ? "Ocultar" : "Mostrar"}
                          >
                            {mostrarPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="cm-pass2">Confirmar</Label>
                        <Input
                          id="cm-pass2"
                          type={mostrarPass ? "text" : "password"}
                          value={confirmarPass}
                          onChange={(e) => setConfirmarPass(e.target.value)}
                        />
                      </div>
                      <Button
                        size="sm"
                        className="rounded-full"
                        disabled={guardandoPass || !nuevoPass || !confirmarPass}
                        onClick={async () => {
                          await cambiarPassword();
                          recargarEstadoAcceso();
                        }}
                      >
                        {guardandoPass ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <KeyRound className="mr-1.5 h-4 w-4" />}
                        Actualizar contraseña
                      </Button>
                    </div>
                  )}

                  {puede("GENERATE_TEMP_PASSWORD") && (confirmGenerar ? (
                    <div className="rounded-lg border border-status-amber/40 bg-status-amber/10 p-3 space-y-2">
                      <p className="text-sm">
                        Se reemplazará la contraseña actual. La contraseña anterior deja de funcionar inmediatamente. Esta acción queda auditada.
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setConfirmGenerar(false)}>
                          Cancelar
                        </Button>
                        <Button
                          size="sm"
                          onClick={async () => {
                            await generarTemporal();
                            recargarEstadoAcceso();
                          }}
                          disabled={generandoTemp}
                        >
                          {generandoTemp ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                          Sí, generar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full justify-start rounded-md"
                      onClick={() => setConfirmGenerar(true)}
                    >
                      <ShieldAlert className="mr-2 h-4 w-4" /> Generar contraseña temporal
                    </Button>
                  ))}
                </div>

              </>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setCredencialesOpen(false);
                setTempPass(null);
                setConfirmGenerar(false);
                setMostrarCambioManual(false);
                setNuevoPass("");
                setConfirmarPass("");
                setEstadoAcceso(null);
              }}
            >
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <UsuarioActividadDialog
        open={Boolean(actividadDe)}
        onOpenChange={(v) => !v && setActividadDe(null)}
        userId={actividadDe?.userId ?? null}
        nombre={actividadDe?.nombre ?? ""}
        email={actividadDe?.email ?? null}
      />
    </Panel>
  );
}
