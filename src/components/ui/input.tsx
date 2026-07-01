import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  /** Convierte automáticamente el valor a MAYÚSCULA (campos operativos/administrativos). */
  uppercase?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, uppercase, onChange, style, ...props }, ref) => {
    const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
      if (uppercase) {
        const up = e.target.value.toUpperCase();
        if (up !== e.target.value) e.target.value = up;
      }
      onChange?.(e);
    };
    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        style={uppercase ? { textTransform: "uppercase", ...style } : style}
        ref={ref}
        onChange={handleChange}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
