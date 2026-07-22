// CONTROL DE MANDO → REGLAS
// Reutiliza los paneles administrativos existentes de reglas de coordinación
// y reglas operativas. No duplica lógica, hooks, query keys ni datos: solo
// monta los mismos componentes que ya se usan desde "Alertas y avisos".
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReglasCoordinacionPanel } from "@/components/coordinacion/reglas-coordinacion-panel";
import { ReglasPanel } from "@/components/coordinacion/reglas-panel";

export function ReglasAdmin() {
  return (
    <Tabs defaultValue="reglas-coord" className="w-full">
      <TabsList className="mb-4 grid h-auto w-full grid-cols-2">
        <TabsTrigger className="whitespace-normal" value="reglas-coord">
          Reglas de coordinación
        </TabsTrigger>
        <TabsTrigger className="whitespace-normal" value="reglas-op">
          Reglas operativas
        </TabsTrigger>
      </TabsList>

      <TabsContent value="reglas-coord">
        <ReglasCoordinacionPanel />
      </TabsContent>
      <TabsContent value="reglas-op">
        <ReglasPanel />
      </TabsContent>
    </Tabs>
  );
}
