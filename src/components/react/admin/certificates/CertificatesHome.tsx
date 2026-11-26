import { useState } from "react";
import { EventPicker } from "../ui/EventPicker";
import { ArrowIcon, CornerNodes } from "../ui/atlas";
import { EventCertificatesPanel } from "./EventCertificatesPanel";

const SLUG_RE = /^[a-zA-Z0-9_-]{1,100}$/;

function slugFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  const slug = new URLSearchParams(window.location.search).get("slug");
  return slug && SLUG_RE.test(slug) ? slug : null;
}

/**
 * /admin/certificates: with `?slug=`, that event's certificates; without
 * it, the event to pick, and the way to the manual certificates.
 */
export function CertificatesHome() {
  const [slug] = useState(slugFromUrl);
  if (slug) return <EventCertificatesPanel slug={slug} />;

  return (
    <div className="max-w-3xl space-y-10">
      <EventPicker
        basePath="/admin/certificates"
        title="Certificados"
        permission="certificates:send"
      />
      <a
        href="/admin/certificates/manual"
        className="border-atlas-line hover:bg-atlas-deep/60 group relative flex items-center gap-4 rounded-xs border px-5 py-4 transition-colors"
      >
        <CornerNodes />
        <span className="min-w-0 flex-1">
          <span className="text-atlas-dust block font-semibold">
            Certificados manuales
          </span>
          <span className="text-atlas-mist mt-0.5 block text-sm">
            Para casos extraordinarios: escribe a las personas o importa un CSV,
            elige el tipo y envía.
          </span>
        </span>
        <ArrowIcon className="text-atlas-fog group-hover:text-atlas-dust size-5 shrink-0 transition-colors" />
      </a>
    </div>
  );
}
