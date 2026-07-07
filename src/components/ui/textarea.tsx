import * as React from "react";

import { cn } from "@/lib/utils";

export interface TextareaProps extends React.ComponentProps<"textarea"> {
  /** Convierte automáticamente el valor a MAYÚSCULA (campos operativos/administrativos). */
  uppercase?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, uppercase, onChange, style, ...props }, ref) => {
    // Por defecto, el texto se escribe en MAYÚSCULA (se puede desactivar con
    // uppercase={false} en campos que lo requieran).
    const forceUpper = uppercase ?? true;
    const handleChange: React.ChangeEventHandler<HTMLTextAreaElement> = (e) => {
      if (forceUpper) {
        const up = e.target.value.toUpperCase();
        if (up !== e.target.value) e.target.value = up;
      }
      onChange?.(e);
    };
    return (
      <textarea
        className={cn(
          "flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        style={forceUpper ? { textTransform: "uppercase", ...style } : style}
        ref={ref}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
