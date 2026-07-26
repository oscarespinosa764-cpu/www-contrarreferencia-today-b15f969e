import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";

type AppRole = "admin" | "operativa" | "temporal";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  rolesLoaded: boolean;
  isAdmin: boolean;
  canEdit: boolean;
  activo: boolean;
  isActiveMember: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Marca de pestaña viva: se borra al cerrar la pestaña/navegador (sessionStorage). */
const TAB_KEY = "ref_tab_alive";

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [activo, setActivo] = useState(false);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadRoles = async (uid: string) => {
      const [{ data: roleRows }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", uid),
        supabase.from("profiles").select("activo").eq("user_id", uid).maybeSingle(),
      ]);
      setRoles((roleRows ?? []).map((r) => r.role as AppRole));
      setActivo(profile?.activo ?? false);
      setRolesLoaded(true);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      // Al iniciar sesión activamente en esta pestaña, marcarla como viva.
      if (event === "SIGNED_IN") {
        // Solo registrar como inicio de sesión real cuando la pestaña aún no
        // estaba marcada (login activo), no en refrescos de token.
        const eraNuevo = !sessionStorage.getItem(TAB_KEY);
        sessionStorage.setItem(TAB_KEY, "1");
        if (eraNuevo) {
          import("@/lib/auditoria.functions")
            .then(({ registrarAuditoria }) =>
              registrarAuditoria({
                data: { accion: "INICIO_SESION", modulo: "auth", tabla: "auth", resultado: "exito" },
              }),
            )
            .catch(() => {});
        }
      }
      if (event === "SIGNED_OUT") {
        sessionStorage.removeItem(TAB_KEY);
        // Limpiar caché de queries del usuario anterior para evitar que
        // datos privados persistan al cambiar de turno. La identidad del
        // dispositivo autorizado vive en IndexedDB y NO se toca aquí.
        queryClient.clear();
      }

      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        setTimeout(() => loadRoles(sess.user.id), 0);
      } else {
        setRoles([]);
        setActivo(false);
        setRolesLoaded(false);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      // Sesión restaurada desde almacenamiento sin marca de pestaña viva =
      // la pestaña/navegador se cerró y se volvió a abrir → cerrar sesión.
      if (data.session && !sessionStorage.getItem(TAB_KEY)) {
        supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setRoles([]);
        setActivo(false);
        setLoading(false);
        return;
      }
      if (data.session) sessionStorage.setItem(TAB_KEY, "1");
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) loadRoles(data.session.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [queryClient]);

  const isAdmin = roles.includes("admin");
  const canEdit = roles.includes("admin") || roles.includes("operativa");
  const isActiveMember = activo && roles.length > 0;

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{ user, session, roles, loading, rolesLoaded, isAdmin, canEdit, activo, isActiveMember, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return ctx;
}
