import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import cedimLogo from "@/assets/cedim-logo.png";
import {
  Headphones,
  Users,
  PieChart,
  FileText,
  CalendarCheck,
  FolderLock,
  Mail,
  Lock,
  User,
  ArrowRight,
} from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Ingresar — CEDIM IPS Referencia" },
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
  { icon: Headphones, label: "PQRS y Atención al Usuario" },
  { icon: Users, label: "Recursos Humanos" },
  { icon: PieChart, label: "Estadísticas e Informes" },
  { icon: FileText, label: "Solicitud de Historias Clínicas" },
  { icon: CalendarCheck, label: "Solicitud de Citas" },
  { icon: FolderLock, label: "Gestión Documental" },
];

function LoginPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else navigate({ to: "/dashboard", replace: true });
  };

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: String(form.get("email")),
      password: String(form.get("password")),
      options: {
        emailRedirectTo: window.location.origin,
        data: { nombre: String(form.get("nombre")) },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else
      toast.success(
        "Cuenta creada. Revisa tu correo para confirmar el registro. Un administrador debe asignarte un rol antes de poder acceder a la información.",
      );
  };

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-background lg:flex-row">
      {/* Left brand panel */}
      <div className="relative hidden items-center justify-center overflow-hidden bg-gradient-brand p-8 lg:flex lg:w-7/12 xl:p-12">
        <div className="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_30%,color-mix(in_oklab,var(--vitalis-blue)_35%,transparent),transparent_40%),radial-gradient(circle_at_80%_70%,color-mix(in_oklab,var(--vitalis-teal)_25%,transparent),transparent_45%)]" />

        <div className="relative z-20 flex w-full max-w-3xl flex-col items-center text-center">
          <div className="mb-8 flex flex-row items-center justify-center gap-5">
            <div className="glass-panel shrink-0 rounded-2xl p-4">
              <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-white/95 text-3xl font-extrabold text-vitalis-main shadow-lg">
                C
              </div>
            </div>
            <h1 className="text-left font-display text-4xl font-extrabold leading-tight tracking-tight text-white xl:text-5xl">
              Gestión Integral <br />
              <span className="text-gradient-accent">Inteligente.</span>
            </h1>
          </div>

          <p className="mx-auto mb-10 max-w-2xl text-lg font-light leading-relaxed text-blue-100/90">
            Plataforma unificada para la optimización clínica y administrativa de CEDIM IPS.
            Acceso seguro a todos los recursos institucionales.
          </p>

          <div className="grid w-full max-w-2xl grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-vitalis-main text-2xl font-extrabold text-white">
              C
            </div>
          </div>

          <div className="mb-8">
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Bienvenido
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Ingresa tus credenciales institucionales.
            </p>
          </div>

          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Ingresar</TabsTrigger>
              <TabsTrigger value="signup">Registrarse</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-5 pt-5">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="l-email"
                    className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Correo Electrónico
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="l-email"
                      name="email"
                      type="email"
                      required
                      placeholder="usuario@cedimips.com"
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
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-5 pt-5">
                <div className="space-y-1.5">
                  <Label
                    htmlFor="s-nombre"
                    className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Nombre completo
                  </Label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input id="s-nombre" name="nombre" type="text" required className="h-12 pl-11" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="s-email"
                    className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Correo Electrónico
                  </Label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="s-email"
                      name="email"
                      type="email"
                      required
                      placeholder="usuario@cedimips.com"
                      className="h-12 pl-11"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label
                    htmlFor="s-pass"
                    className="ml-1 text-xs font-bold uppercase tracking-wider text-muted-foreground"
                  >
                    Contraseña
                  </Label>
                  <div className="relative">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="s-pass"
                      name="password"
                      type="password"
                      minLength={6}
                      required
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
                  {busy ? "Creando…" : "Crear cuenta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>

          <div className="mt-8 text-center">
            <p className="text-xs font-medium text-muted-foreground">
              © 2026 CEDIM IPS — Referencia y Contrarreferencia
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
