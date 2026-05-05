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

interface Props {
  page: string;
  currentPath: string;
}

function AdminContent({ page, currentPath }: Props) {
  const { user, role, loading, isOrganizer, signOut } = useAuth();

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

  if (!isOrganizer) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-lg dark:bg-gray-800">
          <p className="text-4xl">🔒</p>
          <h1 className="mt-4 text-xl font-bold text-gray-900 dark:text-white">
            Acceso restringido
          </h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            Solo organizadores y administradores pueden acceder al panel de
            administracion.
          </p>
          <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
            Sesion: {user.email} (rol: {role})
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <button
              onClick={signOut}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
            >
              Cerrar sesion
            </button>
            <a
              href="/"
              className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Volver al sitio
            </a>
          </div>
        </div>
      </div>
    );
  }

  const pageContent = () => {
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
      case "forms":
        return <FormRegistry />;
      case "form-viewer":
        return <FormViewer />;
      case "ubicaciones":
        return <LocationList />;
      default:
        return (
          <p className="text-gray-500 dark:text-gray-400">
            Pagina en construccion
          </p>
        );
    }
  };

  return <AdminShell currentPage={currentPath}>{pageContent()}</AdminShell>;
}

function DevContent({ page, currentPath }: Props) {
  const pageContent = () => {
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
      case "forms":
        return <FormRegistry />;
      case "form-viewer":
        return <FormViewer />;
      case "ubicaciones":
        return <LocationList />;
      default:
        return (
          <p className="text-gray-500 dark:text-gray-400">
            Pagina en construccion
          </p>
        );
    }
  };

  return (
    <AdminShell currentPage={currentPath}>
      <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-2 text-sm text-yellow-800 dark:border-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400">
        PREVIEW MODE — datos de ejemplo, sin auth
      </div>
      {pageContent()}
    </AdminShell>
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
