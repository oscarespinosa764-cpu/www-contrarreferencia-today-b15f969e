import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/backend-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, ShieldCheck, Loader2 } from "lucide-react";
import cedimLogo from "@/assets/cedim-logo.png";

export const Route = createFileRoute("/activar-cuenta")({
  component: ActivarCuentaPage,
  head: () => ({
    meta: [
      { title: "Activar cuenta — CEDIM IPS" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content:
          "Establece tu contraseña para activar tu cuenta en el sistema de referencia y contrarreferencia de CEDIM IPS.",
      },
    ],
  }),
});

function ActivarCuentaPage() {
  const navigate = useNavigate();
  const registrar = useServerFn(registrarAuditoria);
  const [email, setEmail] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [ver, setVer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    // Supabase procesa automáticamente el hash (?type=invite|recovery + tokens)
    // y establece la sesión temporal. Solo confirmamos que exista.
    let mounted = true;
    (async () => {
      // Da tiempo al cliente para procesar el fragment.
      await new Promise((r) => setTimeout(r, 200));
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session?.user) {
        setEmail(data.session.user.email ?? null);
        setSessionReady(true);
      } else {
        setSessionReady(false);
        setLinkError("EL ENLACE DE ACTIVACIÓN NO ES VÁLIDO O YA VENCIÓ.");
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const validar = (): string | null => {
    if (!pass || !pass2) return "Ambos campos son obligatorios.";
    if (pass !== pass2) return "LAS CONTRASEÑAS NO COINCIDEN.";
    if (pass.trim().length !== pass.length) return "La contraseña no puede tener espacios al inicio o al final.";
    if (pass.length < 10) return "LA CONTRASEÑA NO CUMPLE LOS REQUISITOS DE SEGURIDAD.";
    if (!/[A-Z]/.test(pass) || !/[a-z]/.test(pass) || !/[0-9]/.test(pass) || !/[^A-Za-z0-9]/.test(pass)) {
      return "LA CONTRASEÑA NO CUMPLE LOS REQUISITOS DE SEGURIDAD.";
    }
    if (email && pass.toLowerCase() === email.toLowerCase()) {
      return "LA CONTRASEÑA NO CUMPLE LOS REQUISITOS DE SEGURIDAD.";
    }
    return null;
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const err = validar();
    if (err) return toast.error(err);
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: pass });
      if (error) {
        toast.error("NO FUE POSIBLE ACTUALIZAR LA CONTRASEÑA.");
        return;
      }
      try {
        await registrar({
          data: {
            accion: "USER_ACCOUNT_ACTIVATED",
            modulo: "usuarios",
            tabla: "auth.users",
            resultado: "exito",
          },
        });
      } catch {
        /* auditoría best-effort */
      }
      toast.success("Cuenta activada. Ya puedes iniciar sesión.");
      await supabase.auth.signOut();
      navigate({ to: "/login" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card shadow-lg p-6 space-y-4">
        <div className="flex flex-col items-center gap-2">
          <img src={cedimLogo} alt="CEDIM IPS" className="h-14" />
          <h1 className="text-lg font-bold text-foreground uppercase tracking-wide">Activar cuenta</h1>
          <p className="text-sm text-muted-foreground text-center">
            Confirma tu usuario y establece una contraseña para activar tu cuenta.
          </p>
        </div>

        {sessionReady === null && (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Verificando enlace…
          </div>
        )}

        {sessionReady === false && (
          <div className="rounded-md border border-status-red/40 bg-status-red/10 p-3 text-sm text-status-red">
            {linkError}
            <div className="mt-3">
              <Button variant="outline" onClick={() => navigate({ to: "/login" })}>
                Ir al inicio de sesión
              </Button>
            </div>
          </div>
        )}

        {sessionReady === true && (
          <form onSubmit={onSubmit} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Usuario</Label>
              <Input value={email ?? ""} readOnly disabled />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p1">Nueva contraseña</Label>
              <div className="relative">
                <Input
                  id="p1"
                  type={ver ? "text" : "password"}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="Mín. 10 caracteres, Mayús/minús/número/símbolo"
                  className="pr-9"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setVer((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
                  aria-label={ver ? "Ocultar" : "Mostrar"}
                >
                  {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p2">Confirmar nueva contraseña</Label>
              <Input
                id="p2"
                type={ver ? "text" : "password"}
                value={pass2}
                onChange={(e) => setPass2(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
              Activar cuenta
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
