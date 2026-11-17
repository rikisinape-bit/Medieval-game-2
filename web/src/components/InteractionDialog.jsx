import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

// Conversation panel: on the right of the screen, while the game frames the character you talk to in close-up on the
// left (engine: startTalk / updateTalk). Name, line, and all the choices one under the other.
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

  const handle = (opt) => {
    if (!ready) return;
    if (opt.next) setNode(opt.next);
    else onChoose(opt.effect || "close");
  };
  // Only dialogs that offer a "close" option can be dismissed (e.g. Escape). Before, dismissing Capo Morn's toll = fight.
  const canDismiss = !!node?.options?.some((o) => (o.effect || "close") === "close" && !o.next && !o.disabled);
  useEffect(() => {
    if (!node) return undefined;
    const k = (e) => {
      if (e.key === "Escape" && canDismiss) onChoose("close");
      const i = Number(e.key) - 1, o = node.options[i];                  // keys 1..9 pick a choice
      if (o && !o.disabled) handle(o);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [node, canDismiss, onChoose, ready]);


  if (!node) return null;
  return (
    <>
      {/* cinematic bars and a dark veil on the right, so the panel reads over any scene */}
      <div className="fixed inset-x-0 top-0 h-[6vh] bg-black/80 z-40 pointer-events-none talk-bar" />
      <div className="fixed inset-x-0 bottom-0 h-[6vh] bg-black/80 z-40 pointer-events-none talk-bar" />
      <div className="fixed inset-y-0 right-0 w-[55vw] z-40 pointer-events-none bg-gradient-to-l from-black/70 via-black/40 to-transparent" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="interact-title"
        data-ui=""
        data-testid="interaction-dialog"
        className="fixed z-50 right-[2vw] top-[8vh] bottom-[8vh] w-[min(44vw,30rem)] flex flex-col justify-center talk-panel"
      >
        <div className="parchment rounded-md p-3 md:p-4 max-h-full overflow-y-auto flex flex-col gap-2">
          <h2 id="interact-title" className="font-title text-xl md:text-2xl text-[color:hsl(var(--primary))] tracking-wider" data-testid="interact-title">{node.title}</h2>
          <p className="text-[color:hsl(var(--foreground))] text-sm md:text-base leading-relaxed italic whitespace-pre-line" data-testid="interact-text">{node.text}</p>
          <div className={`mt-2 flex flex-col gap-1.5 transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-40 pointer-events-none"}`} data-testid="interact-options" data-ready={ready ? "1" : "0"}>
            {node.options.map((o, idx) => (
              <Button
                key={idx}
                disabled={!!o.disabled}
                onClick={() => handle(o)}
                className={
                  "justify-start border font-pixel text-sm md:text-base whitespace-normal h-auto py-1.5 text-left disabled:opacity-70 disabled:text-[#b8ab92] " +
                  (o.danger
                    ? "bg-[color:hsl(var(--destructive))] text-red-50 hover:bg-red-800 border-red-900/60"
                    : "bg-[color:hsl(var(--secondary))] text-[color:hsl(var(--foreground))] hover:bg-[color:hsl(var(--primary))] hover:text-[color:hsl(var(--primary-foreground))] border-[color:hsl(var(--border))]")
                }
                data-testid={`interact-option-${idx}`}
              >
                <span className="text-[color:hsl(var(--primary))] mr-1.5">{idx + 1}.</span>{o.label}
              </Button>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
