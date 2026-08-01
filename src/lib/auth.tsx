import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import {
  construirTurnoSesion,
  parseTurnoSesion,
  type TurnoCodigo,
  type TurnoSesion,
} from "@/lib/turno";

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
  turnoSesion: TurnoSesion | null;
  /** `uid` explícito para el instante posterior al login, cuando el contexto
   *  todavía no ha recibido el usuario desde onAuthStateChange. */
  setTurnoSesion: (codigo: TurnoCodigo, uid?: string) => void;
  clearTurnoSesion: () => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/** Marca de pestaña viva: se borra al cerrar la pestaña/navegador (sessionStorage). */
const TAB_KEY = "ref_tab_alive";

/** Clave canónica del turno de sesión por usuario. */
const turnoKey = (uid: string) => `cedim-turno-sesion:${uid}`;

function readTurnoDeSesion(uid: string): TurnoSesion | null {
  try {
    const raw = sessionStorage.getItem(turnoKey(uid));
    if (!raw) return null;
    return parseTurnoSesion(JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeTurnoDeSesion(uid: string, sesion: TurnoSesion) {
  sessionStorage.setItem(turnoKey(uid), JSON.stringify(sesion));
}

function clearTurnoDeSesion(uid: string) {
  sessionStorage.removeItem(turnoKey(uid));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [activo, setActivo] = useState(false);
  const [rolesLoaded, setRolesLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [turnoSesion, setTurnoSesionState] = useState<TurnoSesion | null>(null);

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

    const applySessionUser = (sess: Session | null) => {
      setSession(sess);
      setUser(sess?.user ?? null);
      if (sess?.user) {
        // Al cambiar de usuario descartamos cualquier turno anterior en memoria
        // y leemos únicamente la clave asociada al nuevo user.id.
        setTurnoSesionState(readTurnoDeSesion(sess.user.id));
        setTimeout(() => loadRoles(sess.user.id), 0);
      } else {
        setRoles([]);
        setActivo(false);
        setRolesLoaded(false);
        setTurnoSesionState(null);
      }
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
      if (event === "SIGNED_IN") {
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
        // Limpia el turno del usuario que cerraba sesión (si lo conocemos).
        if (user?.id) clearTurnoDeSesion(user.id);
        setTurnoSesionState(null);
        // Limpia caché de queries del usuario anterior. La identidad del
        // dispositivo autorizado vive en IndexedDB y NO se toca aquí.
        queryClient.clear();
      }

      applySessionUser(sess);
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
        setTurnoSesionState(null);
        setLoading(false);
        return;
      }
      if (data.session) sessionStorage.setItem(TAB_KEY, "1");
      applySessionUser(data.session);
      if (data.session?.user) loadRoles(data.session.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
    // Intencional: no incluir `user` en deps para evitar re-suscripciones.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient]);

  const isAdmin = roles.includes("admin");
  const canEdit = roles.includes("admin") || roles.includes("operativa");
  const isActiveMember = activo && roles.length > 0;

  const setTurnoSesion = useCallback(
    (codigo: TurnoCodigo) => {
      if (!user?.id) return;
      const sesion = construirTurnoSesion(codigo);
      writeTurnoDeSesion(user.id, sesion);
      setTurnoSesionState(sesion);
    },
    [user?.id],
  );

  const clearTurnoSesion = useCallback(() => {
    if (user?.id) clearTurnoDeSesion(user.id);
    setTurnoSesionState(null);
  }, [user?.id]);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        roles,
        loading,
        rolesLoaded,
        isAdmin,
        canEdit,
        activo,
        isActiveMember,
        turnoSesion,
        setTurnoSesion,
        clearTurnoSesion,
        signOut,
      }}
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
