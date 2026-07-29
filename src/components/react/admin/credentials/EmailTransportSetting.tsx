import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "../AuthProvider";

type Transport = "gmail" | "resend";

interface Props {
  onError: (message: string) => void;
}

const LABELS: Record<Transport, { name: string; sender: string }> = {
  gmail: { name: "Gmail", sender: "sale desde tu cuenta de Gmail" },
  resend: { name: "Resend", sender: "sale desde el dominio de GDG Ica" },
};

/**
 * Picks which service sends credential email.
 *
 * Admin-only, and the API enforces it — hiding the control is cosmetic.
 *
 * The sender address is not a separate choice: it follows the transport.
 * Email authentication forbids sending as a gmail.com address through a
 * third party, so "which sender" and "which service" are the same
 * question. Replies reach the same inbox either way.
 *
 * The switch takes effect on the next drain run, within five minutes, and
 * needs no deploy — which is the point. If the provider starts failing
 * during the event, going back is a click.
 */
export function EmailTransportSetting({ onError }: Props) {
  const { can } = useAuth();
  const [transport, setTransport] = useState<Transport | null>(null);
  const [dailyCap, setDailyCap] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const allowed = can("email:transport");

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      const res = await api.getEmailSettings();
      if (cancelled) return;
      if (res.success && res.data) {
        setTransport(res.data.transport);
        setDailyCap(res.data.dailyCap);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  if (!allowed || !transport) return null;

  const change = async (next: Transport) => {
    if (next === transport) return;
    setBusy(true);
    const res = await api.setEmailTransport(next);
    setBusy(false);

    if (!res.success || !res.data) {
      onError(res.error ?? "No se pudo cambiar el proveedor de correo");
      return;
    }
    setTransport(res.data.transport);
    setDailyCap(res.data.dailyCap);
  };

  return (
    <div className="border-gray-custom rounded-lg border bg-white p-3">
      <p className="text-primary text-sm font-semibold">Envío de correos</p>

      <div className="mt-2 flex gap-2">
        {(Object.keys(LABELS) as Transport[]).map((option) => (
          <button
            key={option}
            type="button"
            disabled={busy}
            onClick={() => change(option)}
            aria-pressed={transport === option}
            className={`rounded border px-3 py-1.5 text-sm disabled:opacity-50 ${
              transport === option
                ? "border-google-blue text-google-blue bg-[#EFF6FF] font-semibold"
                : "border-gray-custom text-secondary"
            }`}
          >
            {LABELS[option].name}
          </button>
        ))}
      </div>

      <p className="text-tertiary mt-2 text-xs">
        {LABELS[transport].sender}
        {dailyCap !== null && ` · hasta ${dailyCap} correos al día`}
      </p>
      <p className="text-tertiary mt-1 text-xs">
        Las respuestas llegan a tu correo con cualquiera de los dos. Al pasar el
        límite diario la cola continúa al día siguiente; nadie se queda sin
        credencial.
      </p>
    </div>
  );
}
