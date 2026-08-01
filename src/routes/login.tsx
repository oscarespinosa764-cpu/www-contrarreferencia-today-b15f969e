import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { getTurno, useClientTime, TURNOS_CANONICOS, TURNOS_CODIGOS, isTurnoCodigo, type TurnoCodigo } from "@/lib/turno";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import cedimLogo from "@/assets/cedim-logo.png";
import {
  Home,
  ArrowLeftRight,
  BarChart3,
  Globe,
  Mail,
  Lock,
  ArrowRight,
  ShieldCheck,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Ingresar — CEDIM IPS Referencia y Contrarreferencia" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content:
          "Acceso restringido al sistema interno de coordinación de referencia y contrarreferencia de CEDIM IPS.",
      },
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
  const { user, loading, turnoSesion, setTurnoSesion } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [turnoCodigo, setTurnoCodigo] = useState<TurnoCodigo | "">("");
  const [turnoError, setTurnoError] = useState(false);

  const turnoLabel = useClientTime((d) => {
    const t = getTurno(d);
    return `${t.nombre} · ${pad(t.inicio)}:00 – ${pad(t.fin)}:00`;
  });

  // Sólo se navega al aplicativo cuando existe sesión Y turno operativo válido.
  useEffect(() => {
    if (!loading && user && turnoSesion) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, turnoSesion, navigate]);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    const password = String(form.get("password"));
    if (!email) return toast.error("Ingresa tu correo institucional");
    if (!isTurnoCodigo(turnoCodigo)) {
      setTurnoError(true);
      document.getElementById("l-turno")?.focus();
      return toast.error("Seleccione un turno operativo.");
    }
    setTurnoError(false);
    setBusy(true);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    // Mensaje genérico: no revela si el correo existe o no.
    if (error || !data.user) {
      toast.error("Credenciales incorrectas. Verifica tus datos.");
      return;
    }
    // Persistir el turno únicamente después de una autenticación válida,
    // asociado al user.id real devuelto por Supabase. Se pasa explícitamente
    // porque el contexto de auth aún no ha recibido el usuario en este tick.
    setTurnoSesion(turnoCodigo, data.user.id);
    navigate({ to: "/dashboard", replace: true });
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
              BIENVENIDO
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ingresa con las credenciales asignadas por el administrador.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <Label
                htmlFor="l-email"
                className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
              >
                CORREO ELECTRONICO
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
            <div className="space-y-1.5">
              <Label
                htmlFor="l-turno"
                className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
              >
                Turno operativo
              </Label>
              <div className="relative">
                <Clock className="pointer-events-none absolute left-3.5 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Select
                  value={turnoCodigo}
                  onValueChange={(v) => {
                    setTurnoCodigo(v as TurnoCodigo);
                    setTurnoError(false);
                  }}
                >
                  <SelectTrigger
                    id="l-turno"
                    aria-invalid={turnoError}
                    aria-describedby={turnoError ? "l-turno-error" : undefined}
                    className={`h-12 pl-11 ${turnoError ? "border-destructive" : ""}`}
                  >
                    <SelectValue placeholder="Selecciona tu turno" />
                  </SelectTrigger>
                  <SelectContent>
                    {TURNOS_CODIGOS.map((c) => (
                      <SelectItem key={c} value={c}>{TURNOS_CANONICOS[c].etiqueta}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(turnoError || (user && !turnoSesion)) && (
                <p id="l-turno-error" role="alert" className="ml-1 text-xs font-medium text-destructive">
                  Seleccione un turno operativo para continuar.
                </p>
              )}
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

          <div className="mt-6 flex items-start gap-2 rounded-xl border border-border bg-muted/40 p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <p className="text-xs leading-relaxed text-muted-foreground">
              Acceso exclusivo para personal autorizado. Si necesitas acceso o restablecer tu
              contraseña, contacta al administrador del sistema.
            </p>
          </div>

          <div className="mt-6 space-y-2 text-center">
            <p className="text-xs font-medium text-muted-foreground">
              Horario de Turno: {turnoLabel ?? "—"}
            </p>
            <p className="text-xs font-medium text-muted-foreground">© 2026 CEDIM IPS</p>
          </div>
        </div>
      </div>
    </div>
  );
}
