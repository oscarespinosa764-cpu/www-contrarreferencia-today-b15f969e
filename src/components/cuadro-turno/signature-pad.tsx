import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Eraser } from "lucide-react";

export interface SignaturePadHandle {
  isEmpty: () => boolean;
  toDataURL: () => string;
  clear: () => void;
}

/** Lienzo simple para dibujar una firma (mouse / touch). */
export const SignaturePad = forwardRef<SignaturePadHandle, { height?: number }>(
  function SignaturePad({ height = 160 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
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
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          <Eraser className="mr-1.5 h-3.5 w-3.5" /> Limpiar
        </Button>
      </div>
    );
  },
);
