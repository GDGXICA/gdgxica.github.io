interface Props {
  qrDataUrl: string;

  url: string;
  caption?: string;

  alt?: string;
}

export function HeroQr({
  qrDataUrl,
  url,
  caption = "Escanea para participar",
  alt = "QR de unión",
}: Props) {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 p-8 text-center">
      <p className="text-2xl text-white/70">{caption}</p>
      <div className="h-[60vh] max-h-[640px] w-[60vh] max-w-[640px] rounded-2xl bg-white p-6">
        <img
          src={qrDataUrl}
          alt={alt}
          className="h-full w-full object-contain"
        />
      </div>
      <p className="font-mono text-xl text-white/80">{url}</p>
    </main>
  );
}
