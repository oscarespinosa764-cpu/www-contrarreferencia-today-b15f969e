import { createFileRoute, Outlet, Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import cedimLogo from "@/assets/cedim-logo.png";
import {
  LayoutDashboard,
  Search,
  ClipboardList,
  Network,
  PlusCircle,
  ClipboardCheck,
  Mail,
  BarChart3,
  Zap,
  BookOpen,
  Gauge,
  PanelLeftClose,
  PanelLeftOpen,
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
      { to: "/historial", label: "Historial de Casos", icon: Search },
    ],
  },
  {
    label: "Remisiones salientes",
    abbr: "SAL",
    items: [
      { to: "/remisiones", label: "Dashboard Operativo", icon: ClipboardList },
      { to: "/red-ips", label: "Red / Disponibilidad IPS", icon: Network },
    ],
  },
  {
    label: "Remisiones entrantes",
    abbr: "ENT",
    items: [
      { to: "/casos", label: "Registrar Caso", icon: PlusCircle },
      { to: "/seguimientos", label: "Seguimientos", icon: ClipboardCheck, badge: "seguimientos" },
      { to: "/plantillas", label: "Plantillas", icon: Mail },
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

function AuthenticatedLayout() {
  const { user, loading, roles, isAdmin } = useAuth();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login", replace: true });
  }, [user, loading, navigate]);

  const { data: profile } = useQuery({
    queryKey: ["mi-perfil", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("nombre, cargo").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const { data: pendientes } = useQuery({
    queryKey: ["seguimientos-pendientes"],
    enabled: !!user,
    queryFn: async () => {
      const { count } = await supabase
        .from("seguimientos")
        .select("id", { count: "exact", head: true })
        .eq("archivado", false);
      return count ?? 0;
    },
  });

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Cargando…</p>
      </div>
    );
  }

  const nombre = profile?.nombre || user.email || "";
  const inicial = nombre.charAt(0).toUpperCase();
  const rolLabel = isAdmin ? "Admin" : roles.includes("operativa") ? "Operativa" : roles.join(", ") || "Sin rol";

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <aside
        className={`flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
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
          {!collapsed && (
            <button
              type="button"
              onClick={() => setCollapsed(true)}
              title="Colapsar menú"
              aria-label="Colapsar menú"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          )}
        </div>

        {collapsed && (
          <div className="flex justify-center border-b border-sidebar-border py-2">
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              title="Expandir menú"
              aria-label="Expandir menú"
              className="flex h-8 w-8 items-center justify-center rounded-md text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
          </div>
        )}

        <nav className="flex-1 space-y-5 overflow-auto p-3">
          {groups
            .filter((g) => !g.adminOnly || isAdmin)
            .map((group) => (
              <div key={group.label}>
                {!collapsed && (
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
                        title={collapsed ? item.label : undefined}
                        className={`flex items-center rounded-md text-sm transition-colors ${
                          collapsed ? "justify-center px-2 py-2" : "gap-3 px-3 py-2"
                        } ${
                          active
                            ? "bg-sidebar-primary text-sidebar-primary-foreground"
                            : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        }`}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="flex-1">{item.label}</span>}
                        {!collapsed && item.badge === "seguimientos" && (pendientes ?? 0) > 0 && (
                          <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
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
          <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3 px-1"}`}>
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sidebar-primary text-sidebar-primary-foreground text-sm font-bold">
              {inicial}
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold">{nombre}</p>
                <p className="truncate text-[10px] uppercase tracking-wide text-sidebar-foreground/60">
                  {rolLabel}
                  {profile?.cargo ? ` · ${profile.cargo}` : ""}
                </p>
              </div>
            )}
          </div>
        </div>
      </aside>
      <main className="app-surface h-screen flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
