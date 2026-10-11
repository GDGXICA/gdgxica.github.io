import type { MuralPhoto } from "@/lib/mural";

interface Props {
  photo: MuralPhoto;
  aspect: number;
  leaving: boolean;
}

export function Spotlight({ photo, aspect, leaving }: Props) {
  const alias = photo.alias?.trim();

  return (
    <div
      data-testid="mural-spotlight"
      className={`animate-mural-fade-in pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-8 transition-opacity duration-500 motion-reduce:transition-none ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      <figure
        key={photo.id}
        className="animate-mural-spotlight-in flex flex-col items-center"
      >
        <img
          src={photo.downloadUrl ?? ""}
          alt={alias ? `Foto de ${alias}` : "Foto nueva del mural"}
          className="rounded-2xl object-cover shadow-2xl shadow-black/60"
          style={{
            width: `min(84vw, calc(66vh * ${aspect}))`,
            aspectRatio: String(aspect),
          }}
        />
        <div
          aria-hidden="true"
          className="mt-5 flex h-1.5 w-44 overflow-hidden rounded-full"
        >
          <span className="bg-google-blue flex-1" />
          <span className="bg-google-red flex-1" />
          <span className="bg-google-yellow flex-1" />
          <span className="bg-google-green flex-1" />
        </div>
        <figcaption className="mt-4 text-center">
          <span className="block text-2xl text-white/70">Nueva foto</span>
          {alias && (
            <span className="mt-1 block max-w-[70vw] truncate text-5xl font-semibold text-white">
              {alias}
            </span>
          )}
        </figcaption>
      </figure>
    </div>
  );
}
