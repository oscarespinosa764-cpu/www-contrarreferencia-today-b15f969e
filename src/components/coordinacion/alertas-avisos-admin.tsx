// CONTROL DE MANDO → ALERTAS Y AVISOS
// Subventana administrativa completa (no un modal): cuatro pestañas.
//  1. Reglas de coordinación  2. Reglas operativas  3. Avisos manuales  4. Estado técnico
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReglasCoordinacionPanel } from "@/components/coordinacion/reglas-coordinacion-panel";
import { ReglasPanel } from "@/components/coordinacion/reglas-panel";
import { AvisosManualesPanel } from "@/components/coordinacion/avisos-manuales-panel";
import { ControlMandoPanel } from "@/components/coordinacion/control-mando-panel";

export function AlertasAvisosAdmin() {
  return (
    <Tabs defaultValue="reglas-coord" className="w-full">
      <TabsList className="mb-4 grid h-auto w-full grid-cols-2 sm:grid-cols-4">
        <TabsTrigger className="whitespace-normal" value="reglas-coord">
          Reglas de coordinación
        </TabsTrigger>
        <TabsTrigger className="whitespace-normal" value="reglas-op">
          Reglas operativas
        </TabsTrigger>
        <TabsTrigger className="whitespace-normal" value="avisos-man">
          Avisos manuales
        </TabsTrigger>
        <TabsTrigger className="whitespace-normal" value="estado">
          Estado técnico
        </TabsTrigger>
      </TabsList>

      <TabsContent value="reglas-coord">
        <ReglasCoordinacionPanel />
      </TabsContent>
      <TabsContent value="reglas-op">
        <ReglasPanel />
      </TabsContent>
      <TabsContent value="avisos-man">
        <AvisosManualesPanel />
      </TabsContent>
      <TabsContent value="estado">
        <ControlMandoPanel />
      </TabsContent>
    </Tabs>
  );
}
