import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/backend-client";
import { useAuth } from "@/lib/auth";
import { POLITICA, POLITICA_VERSION } from "@/lib/privacidad";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

/**
 * Puerta de consentimiento informado.
 * Si el usuario activo no ha aceptado la versión vigente de la política de
 * tratamiento de datos, muestra un aviso bloqueante hasta que la acepte.
 */
export function ConsentimientoGate() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [aceptado, setAceptado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  const { data: consentimiento, isLoading } = useQuery({
    queryKey: ["consentimiento", user?.id, POLITICA_VERSION],
    enabled: !!user,
    queryFn: async () => {
      // Tolerar registros duplicados heredados: tomar el primero.
      // `.maybeSingle()` lanzaba error con >1 fila y dejaba el modal atascado.
      const { data, error } = await supabase
        .from("consentimientos")
        .select("id")
        .eq("user_id", user!.id)
        .eq("version", POLITICA_VERSION)
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
  });

  if (isLoading || consentimiento || !user) return null;

  const aceptar = async () => {
    if (!aceptado || guardando) return;
    setGuardando(true);
    // Upsert idempotente: si el usuario ya aceptó (o hace doble clic), no falla.
    const { error } = await supabase
      .from("consentimientos")
      .upsert(
        {
          user_id: user.id,
          version: POLITICA_VERSION,
          aceptado: true,
          user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
        },
        { onConflict: "user_id,version", ignoreDuplicates: false },
      );
    setGuardando(false);
    if (error) {
      console.error("[consentimiento] insert error", error);
      toast.error(
        `No fue posible registrar la aceptación: ${error.message}. Revisa tu conexión e inténtalo nuevamente.`,
      );
      return;
    }
    await qc.invalidateQueries({ queryKey: ["consentimiento", user.id, POLITICA_VERSION] });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl border border-border bg-card p-6 shadow-modern">
        <h2 className="text-lg font-bold text-foreground">
          Política de Tratamiento de Datos
        </h2>
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          Versión {POLITICA_VERSION} · {POLITICA.responsable}
        </p>

        <div className="mt-4 space-y-3 text-sm leading-relaxed text-muted-foreground">
          <p>
            <strong className="text-foreground">Finalidad:</strong> {POLITICA.finalidad}
          </p>
          <p>
            <strong className="text-foreground">Datos sensibles:</strong>{" "}
            {POLITICA.datosSensibles}
          </p>
          <p>
            <strong className="text-foreground">Derechos del titular:</strong> {POLITICA.derechos}
          </p>
          <p>
            <strong className="text-foreground">Contacto:</strong> {POLITICA.contacto}
          </p>
          <Link to="/privacidad" className="inline-block text-primary hover:underline">
            Ver política completa →
          </Link>
        </div>

        <label className="mt-5 flex items-start gap-2.5">
          <Checkbox
            checked={aceptado}
            onCheckedChange={(v) => setAceptado(v === true)}
            className="mt-0.5"
          />
          <span className="text-sm text-foreground">
            Declaro que conozco y acepto la política de tratamiento de datos, y autorizo el
            tratamiento de datos personales y sensibles para las finalidades indicadas.
          </span>
        </label>

        <div className="mt-6 flex justify-end">
          <Button onClick={aceptar} disabled={!aceptado || guardando}>
            {guardando ? "Registrando…" : "Aceptar y continuar"}
          </Button>
        </div>
      </div>
    </div>
  );
}
