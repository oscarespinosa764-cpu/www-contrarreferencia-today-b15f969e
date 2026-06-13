import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/app-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlantillasBiblioteca } from "@/components/coordinacion/plantillas-biblioteca";
import { CatalogoMaestras } from "@/components/catalogo/catalogo-maestras";
import { BookOpen, Mail } from "lucide-react";

export const Route = createFileRoute("/_authenticated/catalogo")({
  component: CatalogoPage,
});

function CatalogoPage() {
  return (
    <div className="flex min-h-full flex-col">
      <AppHeader
        title="Catálogo y Plantillas"
        subtitle="Listas maestras del sistema y biblioteca de plantillas reutilizables"
      />

      <Tabs defaultValue="catalogo" className="flex flex-1 flex-col">
        <TabsList className="mx-auto mb-4">
          <TabsTrigger value="catalogo" className="gap-1.5">
            <BookOpen className="h-4 w-4" /> Catálogo
          </TabsTrigger>
          <TabsTrigger value="plantillas" className="gap-1.5">
            <Mail className="h-4 w-4" /> Plantillas Generales
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalogo" className="mt-0 flex-1">
          <CatalogoMaestras />
        </TabsContent>
        <TabsContent value="plantillas" className="mt-0 flex-1">
          <PlantillasBiblioteca />
        </TabsContent>
      </Tabs>
    </div>
  );
}
