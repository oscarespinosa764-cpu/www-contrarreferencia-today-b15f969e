import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { getTurno } from "@/lib/turno";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import cedimLogo from "@/assets/cedim-logo.png";
import {
  Home,
  ArrowLeftRight,
  BarChart3,
  Globe,
  Mail,
  Lock,
  User,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Ingresar — CEDIM IPS Referencia y Contrarreferencia" },
      {
        name: "description",
        content:
          "Acceso al sistema de coordinación de referencia y contrarreferencia de CEDIM IPS para el equipo autorizado.",
      },
      { property: "og:title", content: "Ingresar — CEDIM IPS Referencia" },
      {
        property: "og:description",
        content:
          "Acceso al sistema de coordinación de referencia y contrarreferencia de CEDIM IPS.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
});

const features = [
  { icon: Home, label: "Remisiones" },
  { icon: ArrowLeftRight, label: "Gestión Interna y Externa" },
  { icon: BarChart3, label: "Indicadores, Estadísticas e Informes" },
  { icon: Globe, label: "Directorio de Red Local y Nacional" },
];

const pad = (n: number) => String(n).padStart(2, "0");

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");

  const turnoLabel = useMemo(() => {
    const t = getTurno();
    return `${t.nombre} · ${pad(t.inicio)}:00 – ${pad(t.fin)}:00`;
  }, []);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    if (!email) return toast.error("Ingresa tu correo institucional");
    setBusy(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) toast.error("Credenciales incorrectas. Verifica tus datos.");
    else navigate({ to: "/dashboard", replace: true });
  };

  const handleRegister = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const nombre = String(form.get("nombre")).trim();
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    const confirm = String(form.get("confirm"));
    if (!nombre) return toast.error("Ingresa tu nombre completo");
    if (!email) return toast.error("Ingresa tu correo institucional");
    if (password.length < 6) return toast.error("La contraseña debe tener al menos 6 caracteres");
    if (password !== confirm) return toast.error("Las contraseñas no coinciden");
    setBusy(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: { nombre },
      },
    });
    setBusy(false);
    if (error) {
      toast.error(
        error.message.includes("already")
          ? "Ya existe una cuenta con ese correo."
          : "No se pudo crear la cuenta. Intenta de nuevo.",
      );
      return;
    }
    toast.success("Cuenta creada. Un administrador debe activar tu acceso antes de ingresar.");
    setMode("login");
  };


  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-background lg:flex-row">
      {/* Left brand panel */}
      <div className="relative hidden items-center overflow-hidden bg-gradient-brand p-8 lg:flex lg:w-7/12 xl:p-12">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_30%,color-mix(in_oklab,var(--vitalis-blue)_35%,transparent),transparent_40%),radial-gradient(circle_at_80%_70%,color-mix(in_oklab,var(--vitalis-teal)_25%,transparent),transparent_45%)]" />

        <div className="relative z-20 flex w-full max-w-2xl flex-col text-left">
          <div className="glass-panel mb-8 w-fit rounded-2xl p-3">
            <img
              src={cedimLogo}
              alt="Logo CEDIM IPS"
              className="h-20 w-auto rounded-xl bg-white/95 p-3 shadow-lg"
            />
          </div>

          <h1 className="font-display text-4xl font-extrabold leading-tight tracking-tight text-white xl:text-5xl">
            Sistema de <br />
            Referencia y <br />
            <span className="text-gradient-accent">Contrarreferencia.</span>
          </h1>

          <p className="mb-10 mt-6 max-w-xl text-base font-light leading-relaxed text-blue-100/90">
            Plataforma unificada para la gestión, coordinación y seguimiento de los procesos de
            Referencia y Contrarreferencia de CEDIM IPS. Acceso seguro a todos los recursos del área.
          </p>

          <div className="grid w-full max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
            {features.map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="group glass-panel flex items-center gap-3 rounded-xl p-3 text-sm font-medium text-white/90 transition-all hover:translate-x-1 hover:bg-white/10"
              >
                <div className="rounded-lg bg-vitalis-blue/20 p-2 transition-colors group-hover:bg-vitalis-blue/40">
                  <Icon className="h-4 w-4 text-vitalis-teal" />
                </div>
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right form panel */}
      <div className="relative flex w-full items-center justify-center bg-background p-6 lg:w-5/12">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="animate-blob absolute -right-20 -top-20 h-96 w-96 rounded-full bg-vitalis-blue/10 blur-3xl" />
          <div className="animate-blob animation-delay-2000 absolute -bottom-20 -left-20 h-96 w-96 rounded-full bg-vitalis-teal/10 blur-3xl" />
        </div>

        <div className="z-10 w-full max-w-md rounded-[2rem] border border-border bg-card p-8 shadow-modern lg:p-10">
          <div className="mb-8 text-center lg:hidden">
            <img src={cedimLogo} alt="Logo CEDIM IPS" className="mx-auto h-16 w-auto" />
          </div>

          <div className="mb-8">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              {mode === "login" ? "Bienvenido" : "Crear cuenta"}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "login"
                ? "Ingresa tus credenciales institucionales para iniciar el turno."
                : "Regístrate con tu correo institucional. Un administrador activará tu acceso."}
            </p>
          </div>

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="space-y-5">
              <div className="space-y-1.5">
                <Label
                  htmlFor="l-email"
                  className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Correo institucional
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="l-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="username"
                    placeholder="nombre@cedimips.com"
                    className="h-12 pl-11"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="l-pass"
                  className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Contraseña
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="l-pass"
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-12 pl-11"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="h-12 w-full text-sm font-bold uppercase tracking-wide shadow-elegant"
                disabled={busy}
              >
                {busy ? "Ingresando…" : "Iniciar sesión"}
                {!busy && <ArrowRight className="ml-1 h-4 w-4" />}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-5">
              <div className="space-y-1.5">
                <Label
                  htmlFor="r-nombre"
                  className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Nombre completo
                </Label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input id="r-nombre" name="nombre" type="text" required placeholder="Tu nombre" className="h-12 pl-11" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="r-email"
                  className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Correo institucional
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="r-email"
                    name="email"
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="nombre@cedimips.com"
                    className="h-12 pl-11"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="r-pass"
                  className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Contraseña
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="r-pass"
                    name="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    placeholder="Mínimo 6 caracteres"
                    className="h-12 pl-11"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label
                  htmlFor="r-confirm"
                  className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                >
                  Confirmar contraseña
                </Label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="r-confirm"
                    name="confirm"
                    type="password"
                    required
                    autoComplete="new-password"
                    placeholder="••••••••"
                    className="h-12 pl-11"
                  />
                </div>
              </div>
              <Button
                type="submit"
                className="h-12 w-full text-sm font-bold uppercase tracking-wide shadow-elegant"
                disabled={busy}
              >
                {busy ? "Creando cuenta…" : "Crear cuenta"}
                {!busy && <ArrowRight className="ml-1 h-4 w-4" />}
              </Button>
            </form>
          )}

          <div className="mt-6 text-center">
            <button
              type="button"
              onClick={() => setMode(mode === "login" ? "register" : "login")}
              className="text-sm font-semibold text-primary transition-colors hover:underline"
            >
              {mode === "login" ? "¿No tienes cuenta? Regístrate" : "¿Ya tienes cuenta? Inicia sesión"}
            </button>
          </div>

          <div className="mt-6 space-y-2 text-center">
            <p className="text-xs font-medium text-muted-foreground">
              Horario de turno: {turnoLabel}
            </p>
            <p className="text-xs font-medium text-muted-foreground">© 2026 CEDIM IPS</p>
          </div>
        </div>
      </div>
    </div>
  );
}
