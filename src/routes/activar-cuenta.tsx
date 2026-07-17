import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/backend-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, ShieldCheck, Loader2, Check, X } from "lucide-react";
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

type Req = { key: string; label: string; ok: boolean };

function evaluar(pass: string, email: string | null): Req[] {
  return [
    { key: "len", label: "MÍNIMO 10 CARACTERES", ok: pass.length >= 10 },
    { key: "upper", label: "AL MENOS UNA LETRA MAYÚSCULA", ok: /[A-Z]/.test(pass) },
    { key: "lower", label: "AL MENOS UNA LETRA MINÚSCULA", ok: /[a-z]/.test(pass) },
    { key: "num", label: "AL MENOS UN NÚMERO", ok: /[0-9]/.test(pass) },
    { key: "sym", label: "AL MENOS UN CARÁCTER ESPECIAL", ok: /[^A-Za-z0-9]/.test(pass) },
    {
      key: "space",
      label: "SIN ESPACIOS AL INICIO O AL FINAL",
      ok: pass.length === 0 || pass.trim() === pass,
    },
    {
      key: "email",
      label: "DIFERENTE AL CORREO",
      ok: !email || (pass.length > 0 && pass.toLowerCase() !== email.toLowerCase()),
    },
  ];
}

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
    let mounted = true;
    (async () => {
      await new Promise((r) => setTimeout(r, 200));
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session?.user) {
        setEmail((data.session.user.email ?? "").toLowerCase() || null);
        setSessionReady(true);
      } else {
        setSessionReady(false);
        setLinkError("EL ENLACE DE ACTIVACIÓN NO ES VÁLIDO O YA VENCIÓ.");
      }
    })();
    return () => {
      mounted = false;
      setPass("");
      setPass2("");
    };
  }, []);

  const reqs = useMemo(() => evaluar(pass, email), [pass, email]);
  const allOk = reqs.every((r) => r.ok) && pass.length > 0;
  const match = pass.length > 0 && pass2.length > 0 && pass === pass2;
  const puedeActivar = allOk && match && !busy;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!allOk) return toast.error("REVISA LOS REQUISITOS DE SEGURIDAD PENDIENTES.");
    if (!match) return toast.error("LAS CONTRASEÑAS NO COINCIDEN.");
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
      setPass("");
      setPass2("");
      toast.success("Cuenta activada. Ya puedes iniciar sesión.");
      await supabase.auth.signOut();
      navigate({ to: "/login" });
    } finally {
      setBusy(false);
    }
  };

  const passInputStyle = { textTransform: "none" as const };

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
          <form onSubmit={onSubmit} className="space-y-3" autoComplete="off">
            <div className="space-y-1.5">
              <Label>Usuario</Label>
              <Input
                value={email ?? ""}
                readOnly
                disabled
                uppercase={false}
                style={{ textTransform: "none" }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p1">Nueva contraseña</Label>
              <div className="relative">
                <Input
                  id="p1"
                  type={ver ? "text" : "password"}
                  value={pass}
                  onChange={(e) => setPass(e.target.value)}
                  placeholder="Escribe tu nueva contraseña"
                  className="pr-9 font-mono"
                  autoComplete="new-password"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  uppercase={false}
                  style={passInputStyle}
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
              <div className="mt-2 rounded-md border border-border bg-muted/30 p-2.5">
                <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">
                  La contraseña debe contener:
                </p>
                <ul className="space-y-1">
                  {reqs.map((r) => (
                    <li key={r.key} className="flex items-center gap-2 text-xs">
                      {r.ok ? (
                        <Check className="h-3.5 w-3.5 text-status-green shrink-0" aria-label="Cumple" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" aria-label="Pendiente" />
                      )}
                      <span className={r.ok ? "text-status-green" : "text-muted-foreground"}>
                        {r.label}
                      </span>
                    </li>
                  ))}
                </ul>
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
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                uppercase={false}
                className="font-mono"
                style={passInputStyle}
              />
              {pass2.length > 0 && (
                <p
                  className={`text-xs flex items-center gap-1.5 ${
                    match ? "text-status-green" : "text-status-red"
                  }`}
                >
                  {match ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                  {match ? "LAS CONTRASEÑAS COINCIDEN." : "LAS CONTRASEÑAS NO COINCIDEN."}
                </p>
              )}
            </div>
            <Button type="submit" disabled={!puedeActivar} className="w-full">
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Activando cuenta…
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" /> Activar cuenta
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
