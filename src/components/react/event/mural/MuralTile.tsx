import { useState } from "react";
import type { MuralPhoto } from "@/lib/mural";

interface Props {
  photo: MuralPhoto;
  width: number;
  height: number;
  hidden?: boolean;
  copy?: boolean;
  entering?: boolean;
  onBroken: (id: string) => void;
}

export function MuralTile({
  photo,
  width,
  height,
  hidden = false,
  copy = false,
  entering = false,
  onBroken,
}: Props) {
  const [animateIn] = useState(entering);
  const alias = photo.alias?.trim();
  const fontSize = Math.round(Math.min(26, Math.max(15, height * 0.072)));

  return (
    <figure
      data-photo-id={photo.id}
      aria-hidden={copy || undefined}
      className={`relative shrink-0 overflow-hidden rounded-2xl bg-[#0b0d13] ring-1 ring-white/12 ${
        hidden ? "invisible" : ""
      } ${animateIn ? "animate-mural-tile-in" : ""}`}
      style={{ width, height }}
    >
      <img
        src={photo.downloadUrl ?? ""}
        alt=""
        draggable={false}
        decoding="async"
        className="h-full w-full object-cover"
        onError={() => onBroken(photo.id)}
      />
      {alias && (
        <figcaption
          className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3.5 pt-10 pb-2.5 font-semibold text-white/95"
          style={{ fontSize }}
        >
          {alias}
        </figcaption>
      )}
    </figure>
  );
}
