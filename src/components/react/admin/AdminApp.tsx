import React from "react";
import { AuthProvider, DevAuthProvider, useAuth } from "./AuthProvider";
import { LoginScreen } from "./LoginScreen";
import { isDevPreview } from "@/lib/api";
import { AdminShell } from "./AdminShell";
import { Dashboard } from "./Dashboard";
import { EventList } from "./events/EventList";
import { EventForm } from "./events/EventForm";
import { TeamList } from "./team/TeamList";
import { SpeakerList } from "./speakers/SpeakerList";
import { SponsorList } from "./sponsors/SponsorList";
import { StatsEditor } from "./stats/StatsEditor";
import { UserDirectory } from "./users/UserDirectory";
import { FormRegistry } from "./forms/FormRegistry";
import { FormViewer } from "./forms/FormViewer";
import { LocationList } from "./locations/LocationList";
import { MinigameTemplateList } from "./minigame-templates/MinigameTemplateList";
import { EventMinigameManager } from "./event-minigames/EventMinigameManager";
import { CertificateSender } from "./certificates/CertificateSender";
import { CheckinPanel } from "./checkin/CheckinPanel";
import { RoleMatrix } from "./roles/RoleMatrix";
import { AuditLog } from "./audit/AuditLog";
import { AccessReview } from "./access/AccessReview";
import { EventStaffPanel } from "./event-staff/EventStaffPanel";
import { ProposalsPanel } from "./proposals/ProposalsPanel";
import { ROLE_BUNDLES, isRole, type Permission } from "@/lib/permissions";

interface Props {
  page: string;
  currentPath: string;
}

interface Guards {
  can: (permission: Permission) => boolean;
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
  // Ver quién opera un evento va con poder ver su roster; asignar exige
  // `users:role:write` y lo comprueba el endpoint.
  "event-staff": "roster:read",
  certificates: "certificates:send",
  checkin: "roster:read",
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
    case "event-staff":
      return <EventStaffPanel />;
    case "proposals":
      return <ProposalsPanel />;
    case "certificates":
      return <CertificateSender />;
    case "checkin":
      return <CheckinPanel />;
    default:
      return (
        <p className="text-gray-500 dark:text-gray-400">
          Pagina en construccion
        </p>
      );
  }
}

function renderPage(page: string, guards: Guards | null) {
  const content = pageContent(page);
  if (!guards) return content;

  const required = PAGE_PERMISSIONS[page];
  // Las páginas acotadas a un evento (check-in, minijuegos) las puede abrir
  // quien tenga el permiso globalmente O quien pueda alcanzarlo estando
  // asignado — de ahí que el voluntario pase esta puerta y sea el servidor
  // quien decida sobre el evento concreto.
  if (
    required &&
    !guards.can(required) &&
    !canReachByAssignment(page, guards)
  ) {
    return <AccessDenied role={guards.role} signOut={guards.signOut} />;
  }
  return content;
}

/** Páginas cuyo permiso un rol puede obtener por asignación a un evento. */
const SCOPED_PAGES = new Set(["checkin", "event-minigames", "event-staff"]);

function canReachByAssignment(page: string, guards: Guards): boolean {
  if (!SCOPED_PAGES.has(page)) return false;
  const bundle = ROLE_BUNDLES[isRole(guards.role) ? guards.role : "member"];
  return bundle.perEvent.length > 0;
}

function AdminContent({ page, currentPath }: Props) {
  const { user, role, loading, canAccessPanel, can, signOut } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (!canAccessPanel) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-lg dark:bg-gray-800">
          <p className="text-4xl">🔒</p>
          <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Acceso restringido
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Tu cuenta no tiene permisos para operar la plataforma. Si formas
            parte del GDG o quieres colaborar, solicita acceso y un
            administrador lo revisara.
          </p>
          <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
            Sesion: {user.email} (rol: {role})
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <button
              onClick={signOut}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cerrar sesion
            </button>
            <a
              href="/admin/solicitar"
              className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Solicitar acceso
            </a>
            <a
              href="/"
              className="inline-block rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Volver al sitio
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AdminShell currentPage={currentPath}>
      {renderPage(page, { can, role, signOut })}
    </AdminShell>
  );
}

function DevContent({ page, currentPath }: Props) {
  return (
    <AdminShell currentPage={currentPath}>
      <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
        PREVIEW MODE — datos de ejemplo, sin auth
      </div>
      {renderPage(page, null)}
    </AdminShell>
  );
}

function AccessDenied({
  role,
  signOut,
}: {
  role: string | null;
  signOut: () => void;
}) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-lg dark:bg-gray-800">
        <p className="text-4xl">🔒</p>
        <h2 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
          Acceso restringido
        </h2>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          Esta seccion requiere permisos de administrador.
        </p>
        <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
          Rol actual: {role}
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button
            onClick={signOut}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
          >
            Cerrar sesion
          </button>
          <a
            href="/admin"
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Ir al dashboard
          </a>
        </div>
      </div>
    </div>
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
