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
      className={`animate-mural-fade-in pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-black/88 p-8 backdrop-blur-md transition-opacity duration-500 motion-reduce:transition-none ${
        leaving ? "opacity-0" : "opacity-100"
      }`}
    >
      <figure
        key={photo.id}
        className="animate-mural-spotlight-in flex flex-col items-center"
      >
        <div className="overflow-hidden rounded-3xl border border-white/20 bg-[#0b0d13] p-2.5 shadow-[0_36px_110px_-20px_rgba(0,0,0,0.95)]">
          <img
            src={photo.downloadUrl ?? ""}
            alt={alias ? `Foto de ${alias}` : "Foto nueva del mural"}
            className="rounded-2xl object-cover"
            style={{
              width: `min(82vw, calc(64vh * ${aspect}))`,
              aspectRatio: String(aspect),
            }}
          />
        </div>
        <div
          aria-hidden="true"
          className="mt-6 flex h-1.5 w-48 overflow-hidden rounded-full"
        >
          <span className="bg-google-blue flex-1" />
          <span className="bg-google-red flex-1" />
          <span className="bg-google-yellow flex-1" />
          <span className="bg-google-green flex-1" />
        </div>
        <figcaption className="mt-4 text-center">
          <span className="block font-mono text-sm font-semibold tracking-[0.22em] text-(--ochre) uppercase">
            Nueva foto en el mural
          </span>
          {alias && (
            <span className="mt-1.5 block max-w-[72vw] truncate font-(family-name:--font-display) text-4xl font-bold text-white sm:text-5xl">
              {alias}
            </span>
          )}
        </figcaption>
      </figure>
    </div>
  );
}
