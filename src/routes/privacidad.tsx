import { createFileRoute, Link } from "@tanstack/react-router";
import { POLITICA, POLITICA_VERSION } from "@/lib/privacidad";

export const Route = createFileRoute("/privacidad")({
  component: PrivacidadPage,
  head: () => ({
    meta: [
      { title: "Política de Tratamiento de Datos — CEDIM IPS" },
      { name: "robots", content: "noindex, nofollow" },
      {
        name: "description",
        content:
          "Política de tratamiento de datos personales y aviso de privacidad del sistema interno de referencia y contrarreferencia de CEDIM IPS.",
      },
    ],
  }),
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1.5">
      <h2 className="text-base font-bold text-foreground">{title}</h2>
      <p className="text-sm leading-relaxed text-muted-foreground">{children}</p>
    </section>
  );
}

function PrivacidadPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-bold text-foreground">
        Política de Tratamiento de Datos y Aviso de Privacidad
      </h1>
      <p className="mt-1 text-xs font-medium text-muted-foreground">
        Versión {POLITICA_VERSION} · {POLITICA.responsable}
      </p>

      <div className="mt-8 space-y-6">
        <Section title="Responsable del tratamiento">
          {POLITICA.responsable}. Canal de contacto: {POLITICA.contacto}.
        </Section>
        <Section title="Finalidad del tratamiento">{POLITICA.finalidad}</Section>
        <Section title="Datos sensibles de salud">{POLITICA.datosSensibles}</Section>
        <Section title="Derechos del titular">{POLITICA.derechos}</Section>
        <Section title="Autorización">
          El uso del sistema por parte del personal autorizado implica el conocimiento y la
          aceptación de esta política, registrándose la fecha, hora y usuario que la acepta.
        </Section>
      </div>

      <div className="mt-10">
        <Link to="/login" className="text-sm font-semibold text-primary hover:underline">
          ← Volver al inicio de sesión
        </Link>
      </div>
    </div>
  );
}
