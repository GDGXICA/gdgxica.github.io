interface Props {
  qrDataUrl: string;
  url: string;
  caption?: string;
  title?: string;
  subtitle?: string;
  alt?: string;
}

export function HeroQr({
  qrDataUrl,
  url,
  caption = "Escanea para participar",
  title,
  subtitle,
  alt = "QR de unión",
}: Props) {
  const cleanUrl = url.replace(/^https?:\/\//, "");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-8 text-center sm:gap-8">
      <div className="space-y-2">
        <p className="font-mono text-sm font-medium tracking-[0.2em] text-(--ochre) uppercase sm:text-base">
          {caption}
        </p>
        {title && (
          <h2 className="m-0 font-(family-name:--font-display) text-3xl font-bold tracking-tight text-white sm:text-5xl">
            {title}
          </h2>
        )}
        {subtitle && (
          <p className="mx-auto max-w-xl text-base text-white/65 sm:text-lg">
            {subtitle}
          </p>
        )}
      </div>

      <div className="relative rounded-3xl border border-white/15 bg-[#0b0d13] p-4 shadow-[0_32px_90px_-24px_rgba(0,0,0,0.95)] sm:p-5">
        <div
          aria-hidden="true"
          className="mb-3 flex h-1.5 w-full overflow-hidden rounded-full"
        >
          <span className="bg-google-blue flex-1" />
          <span className="bg-google-red flex-1" />
          <span className="bg-google-yellow flex-1" />
          <span className="bg-google-green flex-1" />
        </div>
        <div className="aspect-square h-[min(46vh,360px)] w-[min(46vh,360px)] rounded-2xl bg-white p-4 sm:h-[min(52vh,440px)] sm:w-[min(52vh,440px)] sm:p-5">
          <img
            src={qrDataUrl}
            alt={alt}
            className="h-full w-full object-contain"
          />
        </div>
      </div>

      <p className="max-w-full rounded-full border border-white/15 bg-white/[0.04] px-5 py-2 font-mono text-base break-all text-white/90 sm:text-xl">
        {cleanUrl}
      </p>
    </main>
  );
}
