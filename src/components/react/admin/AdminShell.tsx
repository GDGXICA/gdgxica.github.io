import { useAuth } from "./AuthProvider";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/admin", icon: "📊" },
  { label: "Eventos", href: "/admin/eventos", icon: "📅" },
  { label: "Equipo", href: "/admin/equipo", icon: "👥", adminOnly: true },
  { label: "Speakers", href: "/admin/speakers", icon: "🎤" },
  { label: "Sponsors", href: "/admin/sponsors", icon: "🤝", adminOnly: true },
  { label: "Usuarios", href: "/admin/usuarios", icon: "👤", adminOnly: true },
  { label: "Stats", href: "/admin/stats", icon: "📈", adminOnly: true },
];

interface Props {
  currentPage: string;
  children: React.ReactNode;
}

export function AdminShell({ currentPage, children }: Props) {
  const { user, role, signOut, isAdmin } = useAuth();

  const visibleItems = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="hidden w-64 border-r border-gray-200 bg-white lg:block">
        <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-6">
          <img src="/gdg-logo.png" alt="GDG ICA" className="h-8 w-8" />
          <div>
            <p className="text-sm font-bold text-gray-900">GDG ICA</p>
            <p className="text-xs text-gray-500">Admin Panel</p>
          </div>
        </div>
        <nav className="p-4">
          <ul className="space-y-1">
            {visibleItems.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    currentPage === item.href
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="absolute bottom-0 w-64 border-t border-gray-200 p-4">
          <a
            href="/"
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
          >
            ← Volver al sitio
          </a>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6">
          <h1 className="text-lg font-semibold text-gray-900">
            {currentPage === "/admin"
              ? "Dashboard"
              : visibleItems.find((i) => i.href === currentPage)?.label ||
                "Admin"}
          </h1>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-sm font-medium text-gray-900">
                {user?.displayName}
              </p>
              <p className="text-xs text-gray-500">{role}</p>
            </div>
            {user?.photoURL && (
              <img
                src={user.photoURL}
                alt=""
                className="h-8 w-8 rounded-full"
              />
            )}
            <button
              onClick={signOut}
              className="rounded-lg px-3 py-1.5 text-sm text-gray-600 transition-colors hover:bg-gray-100"
            >
              Salir
            </button>
          </div>
        </header>

        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
