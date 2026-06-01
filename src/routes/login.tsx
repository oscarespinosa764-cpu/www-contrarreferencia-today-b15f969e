import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-secondary to-accent px-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="text-center">
          <CardTitle asChild>
            <h1 className="text-2xl font-semibold">CEDIM IPS</h1>
          </CardTitle>
          <CardDescription>Referencia y Contrarreferencia</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Ingresar</TabsTrigger>
              <TabsTrigger value="signup">Registrarse</TabsTrigger>
            </TabsList>
            <TabsContent value="login">
              <form onSubmit={handleLogin} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="l-email">Correo</Label>
                  <Input id="l-email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="l-pass">Contraseña</Label>
                  <Input id="l-pass" name="password" type="password" required />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Ingresando…" : "Ingresar"}
                </Button>
              </form>
            </TabsContent>
            <TabsContent value="signup">
              <form onSubmit={handleSignup} className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label htmlFor="s-nombre">Nombre completo</Label>
                  <Input id="s-nombre" name="nombre" type="text" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-email">Correo</Label>
                  <Input id="s-email" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="s-pass">Contraseña</Label>
                  <Input id="s-pass" name="password" type="password" minLength={6} required />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? "Creando…" : "Crear cuenta"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
