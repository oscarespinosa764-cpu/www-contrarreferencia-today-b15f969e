import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
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
import { Search, UserPlus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/usuarios")({
  component: UsuariosPage,
});

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

function UsuariosPage() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [filtroRol, setFiltroRol] = useState<"todos" | Rol>("todos");

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
    const del = await supabase.from("user_roles").delete().eq("user_id", userId);
    if (del.error) return toast.error(del.error.message);
    const ins = await supabase.from("user_roles").insert({ user_id: userId, role: nuevoRol });
    if (ins.error) return toast.error(ins.error.message);
    toast.success("Rol actualizado");
    qc.invalidateQueries({ queryKey: ["usuarios"] });
  };

  const toggleActivo = async (profileId: string, activo: boolean) => {
    const { error } = await supabase.from("profiles").update({ activo }).eq("id", profileId);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["usuarios"] });
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
      <div>
        <AppHeader title="Usuarios" subtitle="Gestión de credenciales y roles del sistema" />
        <Panel>
          <p className="py-8 text-center text-sm text-muted-foreground">
            Solo el administrador puede gestionar usuarios.
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <AppHeader title="Usuarios" subtitle="Gestión de credenciales y roles del sistema" />

      <Panel
        title="Usuarios internos del turno"
        action={
          <Button size="sm" className="rounded-full" onClick={() => toast.info("Próximamente")}>
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
                          className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase ${rolBadge[rol]}`}
                        >
                          {rolLabels[rol]}
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
                            value={rol}
                            onValueChange={(v) => cambiarRol(u.user_id, v as Rol)}
                            disabled={esYo}
                          >
                            <SelectTrigger className="h-8 w-40 rounded-full text-xs">
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
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 rounded-full"
                            disabled={esYo}
                            onClick={() => toggleActivo(u.id, !u.activo)}
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
      </Panel>
    </div>
  );
}
