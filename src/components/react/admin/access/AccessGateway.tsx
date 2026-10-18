import { useEffect, useState, type ReactNode } from "react";
import { AuthProvider, useAuth } from "../AuthProvider";
import { LoginScreen } from "../LoginScreen";
import { FormField } from "../ui/FormField";
import { ChartRule, LoadingState, buttonClass, inputClass } from "../ui/atlas";
import { useEventCatalog } from "../useEventCatalog";
import { api } from "@/lib/api";
import { ROLE_DESCRIPTIONS, ROLE_LABELS, type Role } from "@/lib/permissions";
import { accessError, redeemError } from "./copy";
import { RoleChoice } from "./RoleChoice";

const REQUESTABLE: Role[] = ["contributor", "volunteer", "organizer"];

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen justify-center px-4 py-16 sm:items-center">
      <div className="w-full max-w-md">
        <img src="/gdg-logo.png" alt="" className="h-8 w-auto" />
        <h1 className="atlas-name text-atlas-dust mt-6 text-[2.25rem] leading-[1.05]">
          {title}
        </h1>
        <ChartRule className="mt-5" />
        {children}
      </div>
    </main>
  );
}

function Waiting({ label }: { label: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <LoadingState label={label} />
    </div>
  );
}

function Session({ email }: { email: string | null }) {
  const { signOut } = useAuth();
  return (
    <p className="text-atlas-fog mt-3 flex flex-wrap items-center gap-x-2 text-sm">
      <span>
        Sesión: <span className="text-atlas-mist">{email}</span>
      </span>
      <button
        type="button"
        onClick={signOut}
        className={`${buttonClass.quiet} -ml-2 sm:ml-0`}
      >
        Usar otra cuenta
      </button>
    </p>
  );
}

function FormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="border-atlas-rose/40 bg-atlas-rose/5 text-atlas-dust rounded-md border px-4 py-3 text-sm"
    >
      {message}
    </p>
  );
}

function EventField({
  value,
  onChange,
}: {
  value: string;
  onChange: (slug: string) => void;
}) {
  const { events, failed } = useEventCatalog();
  const open = (events ?? []).filter((e) => e.status !== "completed");

  if (!failed && open.length > 0) {
    return (
      <FormField label="Evento en el que quieres ayudar (opcional)">
        <select
          className={inputClass}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Cualquiera, el que haga falta</option>
          {open.map((event) => (
            <option key={event.slug} value={event.slug}>
              {event.name}
            </option>
          ))}
        </select>
      </FormField>
    );
  }

  return (
    <FormField label="Evento en el que quieres ayudar (opcional)">
      <input
        type="text"
        maxLength={100}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Nombre del evento"
        className={inputClass}
      />
    </FormField>
  );
}

function RequestForm() {
  const { user, loading, canAccessPanel, profileError, retryProfile } =
    useAuth();
  const [retrying, setRetrying] = useState(false);
  const [existing, setExisting] = useState<{ status: string } | null>(null);
  const [checking, setChecking] = useState(true);
  const [role, setRole] = useState<Role>("contributor");
  const [motivo, setMotivo] = useState("");
  const [links, setLinks] = useState("");
  const [eventSlug, setEventSlug] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!user) {
      setChecking(false);
      return;
    }
    api.getMyAccessRequest().then((res) => {
      if (res.success && res.data) {
        setExisting(res.data as { status: string });
      }
      setChecking(false);
    });
  }, [user]);

  if (loading) return <Waiting label="Comprobando tu sesión…" />;
  if (checking) return <Waiting label="Buscando tu solicitud…" />;
  if (!user) return <LoginScreen />;

  // Sin perfil legible no sabemos si esta persona YA tiene acceso, y
  // ofrecerle el formulario es exactamente lo que metió en la cola una
  // solicitud de organizer firmada por un administrador.
  if (profileError) {
    return (
      <Screen title="No pudimos cargar tu perfil">
        <p className="text-atlas-mist mt-5 leading-relaxed">
          No se pudo leer tu cuenta y, sin eso, no sabemos si ya tienes acceso.
          Suele ser la conexión: reintenta en un momento.
        </p>
        <Session email={user.email} />
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={async () => {
              setRetrying(true);
              await retryProfile();
              setRetrying(false);
            }}
            disabled={retrying}
            className={buttonClass.primary}
          >
            {retrying ? "Reintentando…" : "Reintentar"}
          </button>
          <a href="/" className={buttonClass.secondary}>
            Volver al sitio
          </a>
        </div>
      </Screen>
    );
  }

  if (canAccessPanel) {
    return (
      <Screen title="Ya tienes acceso">
        <p className="text-atlas-mist mt-5 leading-relaxed">
          Tu cuenta ya puede entrar al panel; no hace falta que lo solicites.
        </p>
        <Session email={user.email} />
        <div className="mt-8">
          <a href="/admin" className={buttonClass.primary}>
            Ir al panel
          </a>
        </div>
      </Screen>
    );
  }

  if (sent || existing?.status === "pending") {
    return (
      <Screen title="Solicitud enviada">
        <p className="text-atlas-mist mt-5 leading-relaxed">
          Una persona del equipo la revisará y te escribiremos a{" "}
          <span className="text-atlas-dust">{user.email}</span> con la
          respuesta. No hace falta que la envíes de nuevo.
        </p>
        <div className="mt-8">
          <a href="/" className={buttonClass.secondary}>
            Volver al sitio
          </a>
        </div>
      </Screen>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    const res = await api.createAccessRequest({
      requestedRole: role,
      motivo: motivo.trim(),
      links: links.trim(),
      eventSlug: eventSlug.trim() || undefined,
    });
    if (res.success) setSent(true);
    else
      setError(
        accessError(
          res.error,
          "No se pudo enviar la solicitud. Inténtalo de nuevo en un momento."
        )
      );
    setSending(false);
  }

  const ready = motivo.trim().length > 0;

  return (
    <Screen title="Solicitar acceso">
      <p className="text-atlas-mist mt-5 leading-relaxed">
        Cuéntanos cómo quieres colaborar con GDG ICA. Una persona del equipo lee
        cada solicitud y te responde por correo.
      </p>
      <Session email={user.email} />
      {existing?.status === "rejected" && (
        <p className="border-atlas-line text-atlas-mist mt-5 rounded-md border px-4 py-3 text-sm">
          <span className="atlas-label text-atlas-glow mb-1 block">
            Solicitud anterior
          </span>
          No fue aprobada. Puedes enviarla otra vez contando con más detalle qué
          quieres aportar.
        </p>
      )}

      <form onSubmit={submit} className="mt-8 space-y-6">
        <RoleChoice
          legend="¿Cómo quieres participar?"
          name="rol-solicitado"
          roles={REQUESTABLE}
          value={role}
          onChange={setRole}
        />

        <FormField label="Motivo" required>
          <textarea
            required
            rows={4}
            maxLength={1000}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Qué te gustaría aportar y por qué"
            className={inputClass}
          />
        </FormField>

        <FormField label="Enlaces (opcional)">
          <input
            type="text"
            maxLength={1000}
            value={links}
            onChange={(e) => setLinks(e.target.value)}
            placeholder="GitHub, LinkedIn, portafolio…"
            className={inputClass}
          />
        </FormField>

        {role === "volunteer" && (
          <EventField value={eventSlug} onChange={setEventSlug} />
        )}

        {error && <FormError message={error} />}

        <div>
          <button
            type="submit"
            disabled={sending || !ready}
            className={`${buttonClass.primary} w-full`}
          >
            {sending
              ? "Enviando…"
              : `Solicitar acceso como ${ROLE_LABELS[role]}`}
          </button>
          {!ready && (
            <p className="text-atlas-fog mt-2 text-sm">Falta: el motivo.</p>
          )}
        </div>
      </form>
    </Screen>
  );
}

function RedeemForm() {
  const { user, loading } = useAuth();
  const [token, setToken] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [grantedRole, setGrantedRole] = useState<string | null>(null);

  // El token viene en la URL; se lee una vez al montar.
  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("token");
    if (fromUrl) setToken(fromUrl);
  }, []);

  if (loading) return <Waiting label="Comprobando tu sesión…" />;
  if (!user) return <LoginScreen />;

  if (state === "done") {
    const label = ROLE_LABELS[grantedRole as Role] ?? grantedRole;
    return (
      <Screen title="Invitación aceptada">
        <p className="text-atlas-mist mt-5 leading-relaxed">
          Tu cuenta ahora es{" "}
          <span className="text-atlas-dust font-semibold">{label}</span>.
        </p>
        {grantedRole && ROLE_DESCRIPTIONS[grantedRole as Role] && (
          <p className="text-atlas-fog mt-2 text-sm leading-snug">
            {ROLE_DESCRIPTIONS[grantedRole as Role]}
          </p>
        )}
        <div className="mt-8">
          <a href="/admin" className={buttonClass.primary}>
            Ir al panel
          </a>
        </div>
      </Screen>
    );
  }

  async function redeem(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    const res = await api.redeemInvitation(token.trim());
    if (res.success) {
      setGrantedRole((res.data as { role: string })?.role ?? null);
      setState("done");
    } else {
      setError(redeemError(res.error));
      setState("idle");
    }
  }

  return (
    <Screen title="Aceptar invitación">
      <p className="text-atlas-mist mt-5 leading-relaxed">
        La invitación solo funciona con la cuenta del correo al que se envió. Si
        no es la de abajo, cambia de cuenta antes de aceptarla.
      </p>
      <Session email={user.email} />

      <form onSubmit={redeem} className="mt-8 space-y-6">
        <FormField label="Código de invitación" required>
          <input
            type="text"
            required
            spellCheck={false}
            autoComplete="off"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className={`${inputClass} font-mono`}
          />
        </FormField>

        {error && <FormError message={error} />}

        <button
          type="submit"
          disabled={state === "sending" || token.trim().length === 0}
          className={`${buttonClass.primary} w-full`}
        >
          {state === "sending" ? "Comprobando…" : "Aceptar invitación"}
        </button>
      </form>
    </Screen>
  );
}

/**
 * Pantallas de entrada a la plataforma para quien todavía no tiene permisos.
 * Van fuera del AdminShell a propósito: quien las usa aún no puede pasar de
 * la puerta del panel.
 */
export function AccessGateway({ mode }: { mode: "request" | "redeem" }) {
  return (
    <AuthProvider>
      {mode === "request" ? <RequestForm /> : <RedeemForm />}
    </AuthProvider>
  );
}
