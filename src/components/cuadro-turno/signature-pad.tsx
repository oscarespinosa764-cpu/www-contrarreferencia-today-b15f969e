import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Eraser, Upload } from "lucide-react";
import { toast } from "sonner";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
}

/** Lienzo para dibujar una firma (mouse / touch) o subir una imagen de firma. */
export const SignaturePad = forwardRef<SignaturePadHandle, { height?: number }>(
  function SignaturePad({ height = 160 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const drawing = useRef(false);
    const empty = useRef(true);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      // Ajuste de resolución
      const ratio = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * ratio;
      canvas.height = height * ratio;
      ctx.scale(ratio, ratio);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#0f172a";
    }, [height]);

    const pos = (e: PointerEvent | React.PointerEvent) => {
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      return { x: (e as React.PointerEvent).clientX - rect.left, y: (e as React.PointerEvent).clientY - rect.top };
    };

    const start = (e: React.PointerEvent) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      drawing.current = true;
      empty.current = false;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
    };
    const move = (e: React.PointerEvent) => {
      if (!drawing.current) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const p = pos(e);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    };
    const end = () => { drawing.current = false; };

    const clear = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      empty.current = true;
    };

    const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ""; // permite re-subir el mismo archivo
      if (!file) return;
      if (!file.type.startsWith("image/")) return toast.error("Selecciona un archivo de imagen.");
      if (file.size > 3 * 1024 * 1024) return toast.error("La imagen no debe superar 3 MB.");
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const canvas = canvasRef.current;
          const ctx = canvas?.getContext("2d");
          if (!canvas || !ctx) return;
          const rect = canvas.getBoundingClientRect();
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          // Ajusta la imagen manteniendo proporción dentro del lienzo.
          const cw = rect.width, ch = height;
          const scale = Math.min(cw / img.width, ch / img.height);
          const w = img.width * scale, h = img.height * scale;
          ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
          empty.current = false;
        };
        img.onerror = () => toast.error("No se pudo cargar la imagen.");
        img.src = reader.result as string;
      };
      reader.onerror = () => toast.error("No se pudo leer el archivo.");
      reader.readAsDataURL(file);
    };

    useImperativeHandle(ref, () => ({
      isEmpty: () => empty.current,
      toDataURL: () => canvasRef.current?.toDataURL("image/png") ?? "",
      clear,
    }));

    return (
      <div className="space-y-2">
        <canvas
          ref={canvasRef}
          style={{ height, touchAction: "none" }}
          className="w-full rounded-md border border-input bg-white"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={clear}>
            <Eraser className="mr-1.5 h-3.5 w-3.5" /> Limpiar
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="mr-1.5 h-3.5 w-3.5" /> Subir imagen
          </Button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
        </div>
        <p className="text-[11px] text-muted-foreground">Dibuja la firma o sube una imagen (PNG/JPG, máx. 3 MB).</p>
      </div>
    );
  },
);
