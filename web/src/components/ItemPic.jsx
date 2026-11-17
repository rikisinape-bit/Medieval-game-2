import React, { useMemo } from "react";
import { Package } from "lucide-react";
import { itemThumb } from "@/game3d/thumbs";

// Picture of the real item (its 3D model, rendered once), so you can tell at a glance what it is.
export default function ItemPic({ id, size = 46, className = "" }) {
  const src = useMemo(() => itemThumb(id), [id]);
  if (!src) return <Package size={size * 0.5} className={className} />;
  return <img src={src} alt="" draggable={false} width={size} height={size} className={`object-contain pointer-events-none select-none ${className}`} style={{ width: size, height: size }} />;
}
