import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { useCasos } from "@/lib/use-rc-data";
import { useNotifVencimientosMonitor } from "@/lib/use-notif-vencimientos";
import { SessionTimeout } from "@/components/session-timeout";
import { ConsentimientoGate } from "@/components/consentimiento-gate";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import cedimLogo from "@/assets/cedim-logo.png";
import {
  LayoutDashboard,
  Search,
  ClipboardList,
  Network,
  PlusCircle,
  ClipboardCheck,
  BarChart3,
  Zap,
  BookOpen,
  Gauge,
  CalendarDays,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
  head: () => ({
    meta: [
      { title: "Panel — CEDIM IPS Referencia" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: "seguimientos";
};

type NavGroup = { label: string; abbr: string; adminOnly?: boolean; items: NavItem[] };

const groups: NavGroup[] = [
  {
    label: "Principal",
    abbr: "INI",
    items: [
      { to: "/dashboard", label: "Dashboard General", icon: LayoutDashboard },
      { to: "/historial", label: "Historial de Casos E & S", icon: Search },
      { to: "/red-ips", label: "RED/DISPONIBILIDAD", icon: Network },
      { to: "/cuadro-turno", label: "Cuadro de Turno", icon: CalendarDays },
    ],
  },
  {
    label: "Remisiones",
    abbr: "REM",
    items: [
      { to: "/casos", label: "Dashboard Operativo Entrantes", icon: PlusCircle },
      { to: "/remisiones", label: "Dashboard Operativo salientes", icon: ClipboardList },
    ],
  },
  {
    label: "Gestión de coordinación",
    abbr: "GES",
    adminOnly: true,
    items: [
      { to: "/indicadores", label: "Indicadores", icon: BarChart3 },
      { to: "/catalogo", label: "Catálogos", icon: BookOpen },
      { to: "/control-mando", label: "Control de Mando", icon: Gauge },
      { to: "/reglas", label: "Reglas y Alertas", icon: Zap },
    ],
  },
];

function SidebarContent({
  collapsed,
  allowCollapse,
  onCollapse,
  onExpand,
  onNavigate,
  isAdmin,
  path,
  pendientes,
  nombre,
  inicial,
  rolLabel,
  cargo,
}: {
  collapsed: boolean;
  allowCollapse: boolean;
  onCollapse: () => void;
  onExpand: () => void;
  onNavigate?: () => void;
  isAdmin: boolean;
  path: string;
  pendientes: number;
  nombre: string;
  inicial: string;
  rolLabel: string;
  cargo?: string | null;
}) {
  return (
    <div className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div
        className={`flex items-center border-b border-sidebar-border py-4 ${
          collapsed ? "justify-center px-2" : "gap-3 px-5"
        }`}
      >
        <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
          <img src={cedimLogo} alt="Logo CEDIM IPS" className="h-full w-full object-contain" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-base font-bold leading-tight">CEDIM IPS</p>
            <p className="text-[11px] text-sidebar-foreground/60">Referencia y Contrarreferencia</p>
          </div>
        )}
        {!collapsed && allowCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            title="Colapsar menú"
            aria-label="Colapsar menú"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {collapsed && allowCollapse && (
        <div className="flex justify-center border-b border-sidebar-border py-2">
          <button
            type="button"
            onClick={onExpand}
            title="Expandir menú"
            aria-label="Expandir menú"
            className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      )}

      <nav className="no-scrollbar flex-1 space-y-5 overflow-y-auto overflow-x-hidden p-3">
        {groups
          .filter((g) => !g.adminOnly || isAdmin)
          .map((group) => (
            <div key={group.label}>
              {collapsed ? (
                <p className="pb-1.5 text-center text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/45">
                  {group.abbr}
                </p>
              ) : (
                <p className="px-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/45">
                  {group.label}
                </p>
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const active = path === item.to;
                  return (
                    <Link
                      key={item.to}
                      to={item.to}
                      onClick={onNavigate}
                      title={collapsed ? item.label : undefined}
                      className={`relative flex w-full min-h-[42px] items-center rounded-md text-sm transition-colors ${
                        collapsed ? "justify-center px-2 py-2" : "gap-2.5 px-3 py-2"
                      } ${
                        active
                          ? "bg-sidebar-primary text-sidebar-primary-foreground"
                          : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      }`}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      {!collapsed && (
                        <span className="min-w-0 flex-1 whitespace-normal break-words leading-tight">
                          {item.label}
                        </span>
                      )}
                      {!collapsed && item.badge === "seguimientos" && (pendientes ?? 0) > 0 && (
                        <span className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                          {pendientes}
                        </span>
                      )}
                      {collapsed && item.badge === "seguimientos" && (pendientes ?? 0) > 0 && (
                        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-primary" />
                      )}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <div className={`flex items-center ${collapsed ? "justify-center" : "gap-2.5 px-1"}`}>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-sm font-bold">
            {inicial}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="whitespace-normal break-words text-xs font-semibold leading-tight">{nombre}</p>
              <p className="mt-0.5 whitespace-normal break-words text-[10px] uppercase tracking-wide text-sidebar-foreground/60 leading-tight">
                {rolLabel}
                {cargo ? ` · ${cargo}` : ""}
              </p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

function AuthenticatedLayout() {
  const { user, loading, rolesLoaded, isActiveMember, roles, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  // Cierra el menú móvil al cambiar de ruta.
  useEffect(() => {
    setMobileOpen(false);
  }, [path]);

  const { data: profile } = useQuery({
    queryKey: ["mi-perfil-nav", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("nombre, cargo").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: pendientes } = useQuery({
    queryKey: ["seguimientos-pendientes"],
    enabled: !!user && isActiveMember,
    queryFn: async () => {
      const { count } = await supabase
        .from("seguimientos")
        .select("id", { count: "exact", head: true })
        .eq("archivado", false);
      return count ?? 0;
    },
  });

  // Monitor GLOBAL de vencimientos: genera las notificaciones del sistema
  // (visuales + sonido) de casos entrantes en cualquier ventana/módulo.
  const { data: casos } = useCasos();
  useNotifVencimientosMonitor(casos);



  if (loading || !user || !rolesLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  // Usuario autenticado pero sin rol activo: acceso bloqueado.
  // (La base de datos también lo bloquea vía RLS; esto es la barrera visible.)
  if (!isActiveMember) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-modern">
          <h1 className="text-xl font-bold text-foreground">Acceso no autorizado</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Tu cuenta no tiene un rol activo asignado o está inactiva. Contacta al administrador
            del sistema para habilitar tu acceso.
          </p>
          <button
            onClick={() => {
              signOut();
              navigate({ to: "/login", replace: true });
            }}
            className="mt-6 inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }

  const nombre = profile?.nombre || user.email || "";
  const inicial = nombre.charAt(0).toUpperCase();
  const rolLabel = isAdmin ? "Admin" : roles.includes("operativa") ? "Operativa" : roles.join(", ") || "Sin rol";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Barra lateral fija (escritorio) */}
      <aside
        className={`hidden h-screen shrink-0 transition-[width] duration-200 lg:flex ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        <SidebarContent
          collapsed={collapsed}
          allowCollapse
          onCollapse={() => setCollapsed(true)}
          onExpand={() => setCollapsed(false)}
          isAdmin={isAdmin}
          path={path}
          pendientes={pendientes ?? 0}
          nombre={nombre}
          inicial={inicial}
          rolLabel={rolLabel}
          cargo={profile?.cargo}
        />
      </aside>

      {/* Menú desplegable (móvil / tablet) */}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
          <SidebarContent
            collapsed={false}
            allowCollapse={false}
            onCollapse={() => {}}
            onExpand={() => {}}
            onNavigate={() => setMobileOpen(false)}
            isAdmin={isAdmin}
            path={path}
            pendientes={pendientes ?? 0}
            nombre={nombre}
            inicial={inicial}
            rolLabel={rolLabel}
            cargo={profile?.cargo}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Barra superior con botón de menú (móvil / tablet) */}
        <div className="flex items-center gap-3 border-b border-sidebar-border bg-sidebar px-4 py-3 text-sidebar-foreground lg:hidden">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Abrir menú"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white p-1">
            <img src={cedimLogo} alt="Logo CEDIM IPS" className="h-full w-full object-contain" />
          </div>
          <p className="text-sm font-bold">CEDIM IPS</p>
        </div>

        <main className="app-surface flex-1 overflow-auto p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
      <SessionTimeout />
      <ConsentimientoGate />
    </div>
  );
}
