import React, { useState } from "react";
import { AuthProvider, DevAuthProvider, useAuth } from "./AuthProvider";
import { LoginScreen } from "./LoginScreen";
import { isDevPreview } from "@/lib/api";
import { AdminShell } from "./AdminShell";
import { ChartRule, LoadingState, buttonClass } from "./ui/atlas";
import { Dashboard } from "./Dashboard";
import { EventList } from "./events/EventList";
import { EventForm } from "./events/EventForm";
import { TeamList } from "./team/TeamList";
import { SpeakerList } from "./speakers/SpeakerList";
import { PostList } from "./posts/PostList";
import { SponsorList } from "./sponsors/SponsorList";
import { StatsEditor } from "./stats/StatsEditor";
import { UserDirectory } from "./users/UserDirectory";
import { FormRegistry } from "./forms/FormRegistry";
import { FormViewer } from "./forms/FormViewer";
import { LocationList } from "./locations/LocationList";
import { MinigameTemplateList } from "./minigame-templates/MinigameTemplateList";
import { EventMinigameManager } from "./event-minigames/EventMinigameManager";
import { EventMuralManager } from "./event-mural/EventMuralManager";
import { CertificateSender } from "./certificates/CertificateSender";
import { CheckinPanel } from "./checkin/CheckinPanel";
import { CredentialsPanel } from "./credentials/CredentialsPanel";
import { RoleMatrix } from "./roles/RoleMatrix";
import { AuditLog } from "./audit/AuditLog";
import { AccessReview } from "./access/AccessReview";
import { EventStaffPanel } from "./event-staff/EventStaffPanel";
import { ProposalsPanel } from "./proposals/ProposalsPanel";
import {
  canReachByAssignment,
  ROLE_LABELS,
  type Permission,
  type PermissionSubject,
  type Role,
} from "@/lib/permissions";

interface Props {
  page: string;
  currentPath: string;
}

interface Guards {
  can: (permission: Permission) => boolean;
  profile: PermissionSubject | null;
  role: string | null;
  signOut: () => void;
}

/**
 * Permiso mínimo para abrir cada página. Es la segunda barrera después del
 * menú: entrar por URL directa a una sección que no corresponde da la
 * pantalla de acceso restringido, no la página. La tercera y definitiva es
 * el endpoint.
 */
const PAGE_PERMISSIONS: Record<string, Permission> = {
  events: "events:read",
  "event-form": "events:write",
  team: "team:read",
  speakers: "speakers:read",
  // Ver la lista incluye los borradores. Escribir y borrar los comprueba
  // cada acción, y el endpoint por su cuenta.
  posts: "posts:read",
  sponsors: "sponsors:read",
  stats: "stats:read",
  users: "users:read",
  // La matriz solo enseña lo que ya está en el código del cliente; basta con
  // poder ver el directorio para consultarla.
  roles: "users:read",
  audit: "audit:read",
  access: "access:review",
  // Basta con poder proponer: el panel enseña las propias a quien no revisa.
  proposals: "proposals:create",
  forms: "forms:read",
  "form-viewer": "forms:responses:read",
  locations: "locations:read",
  "minigame-templates": "minigames:template:read",
  "event-minigames": "minigames:operate",

  "event-mural": "mural:moderate",
  // Ver quién opera un evento va con poder ver su roster; asignar exige
  // `users:role:write` y lo comprueba el endpoint.
  "event-staff": "roster:read",
  certificates: "certificates:send",
  checkin: "roster:read",
  // Faltaba, y `renderPage` trata la ausencia como "sin requisito": cualquiera
  // que entrase al panel podía abrir /admin/credentials y recibir la pantalla
  // en vez del aviso de acceso restringido. No era una fuga —las reglas
  // deniegan los datos— pero sí justo el agujero que el comentario de arriba
  // dice que no existe. Mismo permiso que el check-in: una credencial son
  // datos personales del asistente, y el panel enseña el DNI.
  credentials: "roster:read",
};

function pageContent(page: string) {
  switch (page) {
    case "dashboard":
      return <Dashboard />;
    case "events":
      return <EventList />;
    case "event-form":
      return <EventForm />;
    case "team":
      return <TeamList />;
    case "speakers":
      return <SpeakerList />;
    case "posts":
      return <PostList />;
    case "sponsors":
      return <SponsorList />;
    case "stats":
      return <StatsEditor />;
    case "users":
      return <UserDirectory />;
    case "roles":
      return <RoleMatrix />;
    case "audit":
      return <AuditLog />;
    case "access":
      return <AccessReview />;
    case "forms":
      return <FormRegistry />;
    case "form-viewer":
      return <FormViewer />;
    case "locations":
      return <LocationList />;
    case "minigame-templates":
      return <MinigameTemplateList />;
    case "event-minigames":
      return <EventMinigameManager />;
    case "event-mural":
      return <EventMuralManager />;
    case "event-staff":
      return <EventStaffPanel />;
    case "proposals":
      return <ProposalsPanel />;
    case "certificates":
      return <CertificateSender />;
    case "checkin":
      return <CheckinPanel />;
    case "credentials":
      return <CredentialsPanel />;
    default:
      return <p className="text-atlas-mist">Página en construcción</p>;
  }
}

function renderPage(page: string, guards: Guards | null) {
  const content = pageContent(page);
  if (!guards) return content;

  const required = PAGE_PERMISSIONS[page];
  // Las páginas acotadas a un evento (check-in, credenciales, minijuegos) las
  // puede abrir quien tenga el permiso globalmente O quien pueda alcanzarlo
  // estando asignado — de ahí que el voluntario pase esta puerta y sea el
  // servidor quien decida sobre el evento concreto.
  //
  // Ya no hace falta una lista de páginas acotadas: `canReachByAssignment`
  // pregunta por el PERMISO, y un permiso que el rol no alcanza por asignación
  // devuelve false igual. La lista era una segunda fuente de verdad que había
  // que acordarse de ampliar al añadir una página — y a la que ya se le había
  // olvidado `credentials`.
  if (
    required &&
    !guards.can(required) &&
    !(guards.profile && canReachByAssignment(guards.profile, required))
  ) {
    return <AccessDenied role={guards.role} />;
  }
  return content;
}

function AdminContent({ page, currentPath }: Props) {
  const {
    user,
    role,
    profile,
    profileError,
    retryProfile,
    loading,
    canAccessPanel,
    can,
    signOut,
  } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <LoadingState label="Abriendo el panel…" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  // ANTES que la pantalla de permisos, y no después: si el perfil no se pudo
  // leer no sabemos qué permisos tiene esta cuenta, así que decir «no tienes
  // permisos» sería afirmar algo que no comprobamos. Pasó en producción — a
  // un admin le falló la lectura en el wifi del evento, leyó que no tenía
  // acceso y pidió permisos que ya tenía.
  if (profileError) {
    return (
      <ProfileUnavailable
        email={user.email}
        onRetry={retryProfile}
        signOut={signOut}
      />
    );
  }

  if (!canAccessPanel) {
    return (
      <Notice
        title="Todavía no tienes acceso al panel"
        body="Tu cuenta no tiene permisos para operar la plataforma. Si formas parte del GDG o quieres colaborar, solicita acceso y un administrador lo revisará."
        session={`${user.email}`}
        actions={
          <>
            <a href="/admin/solicitar" className={buttonClass.primary}>
              Solicitar acceso
            </a>
            <button onClick={signOut} className={buttonClass.secondary}>
              Cerrar sesión
            </button>
            <a href="/" className={buttonClass.quiet}>
              Volver al sitio
            </a>
          </>
        }
      />
    );
  }

  return (
    <AdminShell currentPage={currentPath}>
      {renderPage(page, { can, profile, role, signOut })}
    </AdminShell>
  );
}

function DevContent({ page, currentPath }: Props) {
  return (
    <AdminShell currentPage={currentPath}>
      <p className="border-atlas-glow/40 text-atlas-glow mb-6 rounded-md border px-4 py-2 text-sm">
        Vista previa local: datos de ejemplo, sin iniciar sesión.
      </p>
      {renderPage(page, null)}
    </AdminShell>
  );
}

/**
 * No pudimos leer `users/{uid}`. No es lo mismo que no tener permisos, y por
 * eso no comparte pantalla con «Acceso restringido»: aquí la acción útil es
 * reintentar, no pedir acceso.
 */
function ProfileUnavailable({
  email,
  onRetry,
  signOut,
}: {
  email: string | null;
  onRetry: () => Promise<void>;
  signOut: () => void;
}) {
  const [retrying, setRetrying] = useState(false);

  async function handleRetry() {
    setRetrying(true);
    await onRetry();
    setRetrying(false);
  }

  return (
    <Notice
      title="No pudimos cargar tu perfil"
      body="Tu sesión sigue abierta, pero no se pudo leer tu cuenta. Suele ser la conexión. Reintenta en un momento; tus permisos no han cambiado."
      session={email}
      actions={
        <>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className={buttonClass.primary}
          >
            {retrying ? "Reintentando…" : "Reintentar"}
          </button>
          <button onClick={signOut} className={buttonClass.secondary}>
            Cerrar sesión
          </button>
        </>
      }
    />
  );
}

function AccessDenied({ role }: { role: string | null }) {
  return (
    <div className="flex min-h-[60vh] items-center">
      <div className="max-w-lg">
        <h2 className="atlas-name text-atlas-dust text-3xl">
          Esta sección no está en tu alcance
        </h2>
        <ChartRule className="mt-4" />
        <p className="text-atlas-mist mt-4">
          Tu cuenta no tiene el permiso que pide esta página. Si lo necesitas,
          pídeselo a un organizador; si trabajas en un evento, entra desde tus
          eventos en el inicio.
        </p>
        {role && (
          <p className="text-atlas-fog mt-2 text-sm">
            Rol actual: {ROLE_LABELS[role as Role] ?? role}
          </p>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="/admin" className={buttonClass.primary}>
            Ir al inicio
          </a>
        </div>
      </div>
    </div>
  );
}

function Notice({
  title,
  body,
  session,
  actions,
}: {
  title: string;
  body: string;
  session: string | null;
  actions: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <img src="/gdg-logo.png" alt="" className="h-8 w-auto" />
        <h1 className="atlas-name text-atlas-dust mt-6 text-[2.25rem] leading-[1.05]">
          {title}
        </h1>
        <ChartRule className="mt-5" />
        <p className="text-atlas-mist mt-5 leading-relaxed">{body}</p>
        {session && (
          <p className="text-atlas-fog mt-3 text-sm">Sesión: {session}</p>
        )}
        <div className="mt-8 flex flex-wrap items-center gap-3">{actions}</div>
      </div>
    </main>
  );
}

export function AdminApp({ page, currentPath }: Props) {
  if (isDevPreview) {
    return (
      <DevAuthProvider>
        <DevContent page={page} currentPath={currentPath} />
      </DevAuthProvider>
    );
  }

  return (
    <AuthProvider>
      <AdminContent page={page} currentPath={currentPath} />
    </AuthProvider>
  );
}
