// CONTROL DE MANDO → ALERTAS Y AVISOS
// Subventana administrativa con tres pestañas:
//  1. Reglas de coordinación
//  2. Reglas operativas
//  3. Avisos manuales
// El "Estado técnico" se administra únicamente en Control de Mando → Usuarios
// para evitar duplicación de componentes y query keys.
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReglasCoordinacionPanel } from "@/components/coordinacion/reglas-coordinacion-panel";
import { ReglasPanel } from "@/components/coordinacion/reglas-panel";
import { AvisosManualesPanel } from "@/components/coordinacion/avisos-manuales-panel";

export function AlertasAvisosAdmin() {
  return (
    <Tabs defaultValue="reglas-coord" className="w-full">
      <TabsList className="mb-4 grid h-auto w-full grid-cols-1 sm:grid-cols-3">
        <TabsTrigger className="whitespace-normal" value="reglas-coord">
          Reglas de coordinación
        </TabsTrigger>
        <TabsTrigger className="whitespace-normal" value="reglas-op">
          Reglas operativas
        </TabsTrigger>
        <TabsTrigger className="whitespace-normal" value="avisos-man">
          Avisos manuales
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
    </Tabs>
  );
}
