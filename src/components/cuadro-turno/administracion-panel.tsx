import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { FirmasPanel } from "./firmas-panel";
import { ConfiguracionPanel } from "./configuracion-panel";

export function AdministracionPanel() {
  const [sub, setSub] = useState("config");
  return (
    <Tabs value={sub} onValueChange={setSub} className="space-y-4">
      <TabsList>
        <TabsTrigger value="config">Configuración</TabsTrigger>
        <TabsTrigger value="firmas">Firmas del personal</TabsTrigger>
      </TabsList>
      <TabsContent value="config">
        <ConfiguracionPanel />
      </TabsContent>
      <TabsContent value="firmas">
        <FirmasPanel />
      </TabsContent>
    </Tabs>
  );
}
