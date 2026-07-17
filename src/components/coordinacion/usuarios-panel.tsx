import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { Panel } from "@/components/stat-card";
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
import { Search, UserPlus, Loader2, Activity, Pencil, Eye, EyeOff, Copy, KeyRound, ShieldAlert } from "lucide-react";
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
  password: "",
  rol: "operativa" as Rol,
  activo: true,
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
  const cambiarRolFn = useServerFn(cambiarRolUsuario);
  const cambiarEstadoFn = useServerFn(cambiarEstadoUsuario);
  const editarFn = useServerFn(editarUsuario);
  const obtenerEmailFn = useServerFn(obtenerEmailUsuario);
  const cambiarEmailFn = useServerFn(cambiarEmailUsuario);
  const cambiarPassFn = useServerFn(cambiarPasswordUsuario);
  const generarTempFn = useServerFn(generarPasswordTemporalUsuario);


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
    qc.invalidateQueries({ queryKey: ["usuarios"] });
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
    if (form.password.length < 12)
      return toast.error("La contraseña debe tener al menos 12 caracteres.");
    setGuardando(true);
    try {
      const res = await crear({
        data: {
          nombre: form.nombre.trim(),
          email: form.email.trim(),
          cargo: form.cargo.trim(),
          telefono: form.telefono.trim(),
          password: form.password,
          rol: form.rol,
          activo: form.activo,
        },
      });
      if (!res.ok) {
        toast.error(res.error ?? "No se pudo crear el usuario.");
        return;
      }
      toast.success("Usuario creado correctamente.");
      setForm(emptyForm);
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["usuarios"] });
    } catch {
      toast.error("Error al crear el usuario. Intenta de nuevo.");
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
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="rounded-full pl-9"
            placeholder="Buscar nombre, documento, cargo…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Select value={filtroRol} onValueChange={(v) => setFiltroRol(v as typeof filtroRol)}>
          <SelectTrigger className="w-44 rounded-full">
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
      </div>

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
            <div className="space-y-1.5">
              <Label htmlFor="n-pass">Contraseña inicial</Label>
              <Input
                id="n-pass"
                type="text"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Mínimo 12 caracteres, con mayúsculas, minúsculas y números"
              />
              <p className="text-[11px] text-muted-foreground">
                Comunícasela al usuario por un canal seguro. Mínimo 12 caracteres.
              </p>
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
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Creando…
                </>
              ) : (
                "Crear usuario"
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

              <div className="rounded-lg border border-border/60 bg-muted/30 p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <KeyRound className="h-4 w-4" /> Restablecer contraseña
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-pass">Nueva contraseña</Label>
                  <div className="relative">
                    <Input
                      id="e-pass"
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
                      aria-label={mostrarPass ? "Ocultar contraseña" : "Mostrar contraseña"}
                    >
                      {mostrarPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="e-pass2">Confirmar contraseña</Label>
                  <Input
                    id="e-pass2"
                    type={mostrarPass ? "text" : "password"}
                    value={confirmarPass}
                    onChange={(e) => setConfirmarPass(e.target.value)}
                  />
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-full"
                  disabled={guardandoPass || !nuevoPass || !confirmarPass}
                  onClick={cambiarPassword}
                >
                  {guardandoPass ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <KeyRound className="mr-1.5 h-4 w-4" />}
                  Actualizar contraseña
                </Button>
              </div>

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
