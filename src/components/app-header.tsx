import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Moon, Sun, X } from "lucide-react";
import { getSaludo, getSaludoEmoji, getTurnoLabel, getPrimerNombre, useClientTime } from "@/lib/turno";

function useThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const saved = typeof window !== "undefined" && localStorage.getItem("theme") === "dark";
    setDark(saved);
    document.documentElement.classList.toggle("dark", saved);
  }, []);
  const toggle = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  };
  return { dark, toggle };
}

export function AppHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const { user, signOut } = useAuth();
  const { dark, toggle } = useThemeToggle();

  const { data: profile } = useQuery({
    queryKey: ["mi-perfil", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("nombre").eq("user_id", user!.id).maybeSingle();
      return data;
    },
  });

  const nombre = getPrimerNombre(profile?.nombre || user?.email || "");
  const saludo = useClientTime((d) => `${getSaludo(d)}, `);
  const saludoEmoji = useClientTime((d) => getSaludoEmoji(d));
  const turnoLabel = useClientTime((d) => getTurnoLabel(d));

  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <p className="text-lg font-bold text-foreground">
        {getSaludo()}, {nombre} {getSaludoEmoji()}
      </p>

      <div className="order-last w-full text-center sm:order-none sm:w-auto sm:flex-1">
        <h1 className="text-2xl font-extrabold uppercase tracking-tight text-foreground sm:text-[28px]">
          {title}
        </h1>
        {subtitle && <p className="text-sm font-semibold text-vitalis-blue">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-2">
        <span className="rounded-full border border-vitalis-blue/30 bg-vitalis-blue/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-vitalis-blue">
          {getTurnoLabel()}
        </span>
        <Button
          variant="outline"
          size="icon"
          className="h-9 w-9 rounded-full"
          onClick={toggle}
          aria-label="Cambiar tema"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => signOut()}>
          <X className="mr-1.5 h-4 w-4" /> Cerrar sesión
        </Button>
      </div>
    </header>
  );
}
