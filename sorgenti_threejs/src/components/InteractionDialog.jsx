import React, { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export default function InteractionDialog({ interaction, onChoose }) {
  const [node, setNode] = useState(interaction);
  const [ready, setReady] = useState(false);

  useEffect(() => { setNode(interaction); }, [interaction]);
  // Short reading delay so a held "interact" press cannot instantly trigger an option.
  useEffect(() => {
    setReady(false);
    if (!node) return undefined;
    const t = setTimeout(() => setReady(true), 650);
    return () => clearTimeout(t);
  }, [node]);

  const open = !!node;
  const handle = (opt) => {
    if (!ready) return;
    if (opt.next) setNode(opt.next);
    else onChoose(opt.effect || "close");
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onChoose("close"); }}>
      <DialogContent
        className="parchment border-[color:hsl(var(--border))] max-w-lg max-h-[100dvh] overflow-y-auto gap-2 p-4"
        data-testid="interaction-dialog"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        {node && (
          <>
            <DialogHeader>
              <DialogTitle className="font-title text-2xl text-[color:hsl(var(--primary))] tracking-wider" data-testid="interact-title">
                {node.title}
              </DialogTitle>
              <DialogDescription className="text-[color:hsl(var(--foreground))] text-base leading-relaxed italic whitespace-pre-line" data-testid="interact-text">
                {node.text}
              </DialogDescription>
            </DialogHeader>
            <div className={`mt-3 flex flex-col gap-2 transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-40 pointer-events-none"}`} data-testid="interact-options" data-ready={ready ? "1" : "0"}>
              {node.options.map((o, idx) => (
                <Button
                  key={idx}
                  disabled={!!o.disabled}
                  onClick={() => handle(o)}
                  className={
                    "justify-start border font-pixel text-base whitespace-normal h-auto text-left disabled:opacity-70 disabled:text-[#b8ab92] " +
                    (o.danger
                      ? "bg-[color:hsl(var(--destructive))] text-red-50 hover:bg-red-800 border-red-900/60"
                      : "bg-[color:hsl(var(--secondary))] text-[color:hsl(var(--foreground))] hover:bg-[color:hsl(var(--primary))] hover:text-[color:hsl(var(--primary-foreground))] border-[color:hsl(var(--border))]")
                  }
                  data-testid={`interact-option-${idx}`}
                >
                  {o.label}
                </Button>
              ))}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
