import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

function UsuariosPage() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();

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

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Usuarios" />
        <p className="text-muted-foreground">Solo el administrador puede gestionar usuarios.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usuarios"
        description="Gestiona el equipo: asigna roles y controla quién tiene acceso al sistema."
      />

      {isLoading ? (
        <p className="text-muted-foreground">Cargando…</p>
      ) : usuarios && usuarios.length > 0 ? (
        <div className="grid gap-3">
          {usuarios.map((u) => {
            const rolActual = (u.roles[0] ?? "operativa") as Rol;
            const esYo = u.user_id === user?.id;
            return (
              <Card key={u.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">
                      {u.nombre || "Sin nombre"}
                      {esYo && <span className="ml-2 text-xs text-muted-foreground">(tú)</span>}
                    </CardTitle>
                    <Badge variant={u.activo ? "default" : "secondary"}>{u.activo ? "Activo" : "Inactivo"}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-4">
                  <div className="text-sm text-muted-foreground">
                    {u.cargo && <p>{u.cargo}</p>}
                    <p>Rol actual: {rolLabels[rolActual]}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">Acceso</span>
                      <Switch
                        checked={u.activo}
                        disabled={esYo}
                        onCheckedChange={(v) => toggleActivo(u.id, v)}
                      />
                    </div>
                    <Select value={rolActual} onValueChange={(v) => cambiarRol(u.user_id, v as Rol)} disabled={esYo}>
                      <SelectTrigger className="w-48">
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
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <p className="text-muted-foreground">Aún no hay usuarios registrados.</p>
      )}
    </div>
  );
}
