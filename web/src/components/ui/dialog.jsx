// Sostituto minimo del Dialog di shadcn/ui (stessa API usata dal gioco).
// Esc chiama onOpenChange(false); il clic fuori è ignorato (il gioco lo bloccava comunque).
import React, { createContext, useContext, useEffect } from "react";

const Ctx = createContext({ onOpenChange: () => {} });

export function Dialog({ open, onOpenChange, children }) {
  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === "Escape") onOpenChange?.(false); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [open, onOpenChange]);
  if (!open) return null;
  return <Ctx.Provider value={{ onOpenChange }}>{children}</Ctx.Provider>;
}

export function DialogContent({ className = "", children, onPointerDownOutside, onInteractOutside, ...props }) {
  useContext(Ctx);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2">
      <div role="dialog" aria-modal="true" className={`relative grid w-full rounded-md ${className}`} {...props}>{children}</div>
    </div>
  );
}
export const DialogHeader = ({ className = "", ...p }) => <div className={`flex flex-col gap-1.5 ${className}`} {...p} />;
export const DialogTitle = ({ className = "", ...p }) => <h2 className={className} {...p} />;
export const DialogDescription = ({ className = "", ...p }) => <p className={className} {...p} />;
