import { AuthProvider, useAuth } from "./AuthProvider";
import { LoginScreen } from "./LoginScreen";
import { AdminShell } from "./AdminShell";
import { Dashboard } from "./Dashboard";
import { EventList } from "./events/EventList";
import { EventForm } from "./events/EventForm";
import { TeamList } from "./team/TeamList";
import { SpeakerList } from "./speakers/SpeakerList";
import { SponsorList } from "./sponsors/SponsorList";
import { StatsEditor } from "./stats/StatsEditor";
import { UserDirectory } from "./users/UserDirectory";

interface Props {
  page: string;
  currentPath: string;
}

function AdminContent({ page, currentPath }: Props) {
  const { user, loading, isOrganizer } = useAuth();

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
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <p className="text-4xl">🔒</p>
          <h1 className="mt-4 text-xl font-bold text-gray-900">
            Acceso restringido
          </h1>
          <p className="mt-2 text-gray-600">
            Solo organizadores y administradores pueden acceder al panel de
            administracion.
          </p>
          <a
            href="/"
            className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Volver al sitio
          </a>
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
      default:
        return <p className="text-gray-500">Pagina en construccion</p>;
    }
  };

  return <AdminShell currentPage={currentPath}>{pageContent()}</AdminShell>;
}

export function AdminApp({ page, currentPath }: Props) {
  return (
    <AuthProvider>
      <AdminContent page={page} currentPath={currentPath} />
    </AuthProvider>
  );
}
