// Sostituto minimo del Button di shadcn/ui (stessa API usata dal gioco).
import React from "react";

export const Button = React.forwardRef(function Button({ className = "", ...props }, ref) {
  return <button ref={ref} className={`inline-flex items-center rounded-sm px-3 py-2 text-sm transition-colors disabled:pointer-events-none ${className}`} {...props} />;
});
