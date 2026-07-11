import * as React from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: "default" | "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center justify-center rounded-full px-2 py-0.5 text-xs font-semibold leading-none",
        variant === "default" && "bg-signal-blue text-white",
        variant === "muted" && "bg-bg-active text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}
