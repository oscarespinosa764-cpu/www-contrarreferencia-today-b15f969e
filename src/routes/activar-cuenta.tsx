import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { supabase } from "@/lib/backend-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { registrarAuditoria } from "@/lib/auditoria.functions";
import { useServerFn } from "@tanstack/react-start";
import { Eye, EyeOff, ShieldCheck, Loader2, Check, X, KeyRound } from "lucide-react";
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
type Modo = "invite" | "recovery";

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

function detectarModoInicial(): Modo {
  if (typeof window === "undefined") return "invite";
  const search = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(
    window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "",
  );
  const tipo = (search.get("type") ?? hash.get("type") ?? "").toLowerCase();
  if (tipo === "recovery") return "recovery";
  if (tipo === "invite" || tipo === "signup") return "invite";
  return "invite";
}

function ActivarCuentaPage() {
  const navigate = useNavigate();
  const registrar = useServerFn(registrarAuditoria);
  const [email, setEmail] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState<boolean | null>(null);
  const [modo, setModo] = useState<Modo>(() => detectarModoInicial());
  const [pass, setPass] = useState("");
  const [pass2, setPass2] = useState("");
  const [ver, setVer] = useState(false);
  const [busy, setBusy] = useState(false);
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    // CRÍTICO: marcar la pestaña como viva ANTES de cualquier lectura de sesión
    // para evitar que AuthProvider cierre la sesión de recuperación/invitación
    // recién establecida por el enlace del correo.
    if (typeof window !== "undefined") {
      sessionStorage.setItem("ref_tab_alive", "1");
    }

    const finalizar = (session: { user?: { email?: string | null } | null } | null) => {
      if (!mounted) return;
      if (session?.user) {
        setEmail((session.user.email ?? "").toLowerCase() || null);
        setSessionReady(true);
      } else {
        setSessionReady(false);
        setLinkError(
          "EL ENLACE NO ES VÁLIDO, YA FUE UTILIZADO O VENCIÓ. SOLICITA UNO NUEVO.",
        );
      }
    };

    // Escuchar el evento de recuperación para diferenciar recovery vs invite.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setModo("recovery");
      }
      if (session?.user && sessionReady !== true) {
        setEmail((session.user.email ?? "").toLowerCase() || null);
        setSessionReady(true);
      }
    });

    (async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const tokenHash =
          url.searchParams.get("token_hash") ?? url.searchParams.get("token");
        const tipoParam = (url.searchParams.get("type") ?? "").toLowerCase();

        // 1) Flujo PKCE (?code=...). Intercambiar por sesión.
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.warn("[activar-cuenta] exchange failed", {
              stage: "SESSION_EXCHANGE",
              code: (error as { status?: number }).status,
              message: error.message,
            });
          }
        } else if (tokenHash && (tipoParam === "recovery" || tipoParam === "invite" || tipoParam === "signup")) {
          // 2) Flujo token_hash (OTP verify)
          const { error } = await supabase.auth.verifyOtp({
            type: tipoParam as "recovery" | "invite" | "signup",
            token_hash: tokenHash,
          });
          if (error) {
            console.warn("[activar-cuenta] verifyOtp failed", {
              stage: "SESSION_EXCHANGE",
              message: error.message,
            });
          }
        }

        // Pequeña espera para permitir a detectSessionInUrl (hash flow) completar.
        await new Promise((r) => setTimeout(r, 150));
        const { data } = await supabase.auth.getSession();
        finalizar(data.session);
      } catch (e) {
        console.warn("[activar-cuenta] init error", e);
        finalizar(null);
      }
    })();

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      setPass("");
      setPass2("");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reqs = useMemo(() => evaluar(pass, email), [pass, email]);
  const allOk = reqs.every((r) => r.ok) && pass.length > 0;
  const match = pass.length > 0 && pass2.length > 0 && pass === pass2;
  const puedeSubmit = allOk && match && !busy;

  const esRecovery = modo === "recovery";
  const titulo = esRecovery ? "Restablecer contraseña" : "Activar cuenta";
  const descripcion = esRecovery
    ? "Confirma tu usuario y establece una nueva contraseña para recuperar el acceso a tu cuenta."
    : "Confirma tu usuario y establece una contraseña para activar tu cuenta.";
  const botonLabel = esRecovery ? "Actualizar contraseña" : "Activar cuenta";
  const botonBusy = esRecovery ? "Actualizando contraseña…" : "Activando cuenta…";
  const toastExito = esRecovery
    ? "Contraseña actualizada correctamente. Ya puedes ingresar con tu nueva contraseña."
    : "Cuenta activada. Ya puedes iniciar sesión.";

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!allOk) return toast.error("REVISA LOS REQUISITOS DE SEGURIDAD PENDIENTES.");
    if (!match) return toast.error("LAS CONTRASEÑAS NO COINCIDEN.");
    setBusy(true);
    try {
      // Reconfirmar sesión antes de updateUser para no ejecutar sin sesión válida.
      const { data: cur } = await supabase.auth.getSession();
      if (!cur.session?.user) {
        toast.error("NO SE PUDO VALIDAR LA SESIÓN DEL ENLACE. SOLICITA UNO NUEVO.");
        setSessionReady(false);
        setLinkError("EL ENLACE YA FUE UTILIZADO O VENCIÓ. SOLICITA UNO NUEVO.");
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: pass });
      if (error) {
        const msg = (error.message || "").toLowerCase();
        console.warn("[activar-cuenta] updateUser failed", {
          stage: "PASSWORD_UPDATE_FAILED",
          message: error.message,
        });
        if (msg.includes("session")) {
          toast.error("NO SE PUDO VALIDAR LA SESIÓN DEL ENLACE. SOLICITA UNO NUEVO.");
        } else if (msg.includes("expired") || msg.includes("invalid")) {
          toast.error("EL ENLACE DE RESTABLECIMIENTO VENCIÓ O NO ES VÁLIDO.");
        } else if (msg.includes("same") || msg.includes("password")) {
          toast.error("LA NUEVA CONTRASEÑA NO CUMPLE LA POLÍTICA O ES IGUAL A LA ANTERIOR.");
        } else {
          toast.error(
            "NO FUE POSIBLE ACTUALIZAR LA CONTRASEÑA EN ESTE MOMENTO. INTÉNTALO NUEVAMENTE O SOLICITA UN NUEVO ENLACE.",
          );
        }
        return;
      }

      try {
        await registrar({
          data: {
            accion: esRecovery ? "USER_PASSWORD_RESET_COMPLETED" : "USER_ACCOUNT_ACTIVATED",
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
      toast.success(toastExito);
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
          <h1 className="text-lg font-bold text-foreground uppercase tracking-wide">{titulo}</h1>
          <p className="text-sm text-muted-foreground text-center">{descripcion}</p>
        </div>

        {sessionReady === null && (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Verificando enlace…
          </div>
        )}

        {sessionReady === false && (
          <div className="rounded-md border border-status-red/40 bg-status-red/10 p-3 text-sm text-status-red space-y-3">
            <p className="font-semibold uppercase">Enlace no disponible</p>
            <p>{linkError}</p>
            <Button variant="outline" onClick={() => navigate({ to: "/login" })}>
              Volver al inicio de sesión
            </Button>
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
              <Label htmlFor="p1">{esRecovery ? "Nueva contraseña" : "Nueva contraseña"}</Label>
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
            <Button type="submit" disabled={!puedeSubmit} className="w-full">
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {botonBusy}
                </>
              ) : esRecovery ? (
                <>
                  <KeyRound className="mr-2 h-4 w-4" /> {botonLabel}
                </>
              ) : (
                <>
                  <ShieldCheck className="mr-2 h-4 w-4" /> {botonLabel}
                </>
              )}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
