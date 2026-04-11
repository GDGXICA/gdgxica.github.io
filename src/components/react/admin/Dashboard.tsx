import { useAuth } from "./AuthProvider";

const QUICK_LINKS = [
  { label: "Crear evento", href: "/admin/eventos/nuevo", icon: "📅" },
  { label: "Ver sitio", href: "/", icon: "🌐" },
];

export function Dashboard() {
  const { user, role } = useAuth();

  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-blue-100 bg-blue-50 p-6 dark:border-blue-800 dark:bg-blue-900/30">
        <h2 className="text-xl font-bold text-gray-900 dark:text-white">
          Bienvenido, {user?.displayName}
        </h2>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Rol: <span className="font-medium capitalize">{role}</span>
        </p>
      </div>

      <div>
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Acciones rapidas
        </h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-4 transition-shadow hover:shadow-md dark:border-gray-700 dark:bg-gray-800"
            >
              <span className="text-2xl">{link.icon}</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {link.label}
              </span>
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
