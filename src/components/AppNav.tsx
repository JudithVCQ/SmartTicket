import { Link, useNavigate } from "@tanstack/react-router";
import { clearAuthSession, isAuthenticated } from "@/lib/auth-session";

const links = [
  { to: "/dashboard", label: "Inicio" },
  { to: "/tickets", label: "Mis Tickets" },
  { to: "/tecnico", label: "Operaciones" },
] as const;

export function AppNav() {
  const navigate = useNavigate();
  const authenticated = isAuthenticated();

  const handleLogout = () => {
    clearAuthSession();
    navigate({ to: "/login" });
  };

  return (
    <nav className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link to="/" className="font-mono font-bold tracking-tighter text-xl">
            SMART<span className="text-primary">TICKET</span>
          </Link>
          <div className="hidden md:flex gap-6 text-sm font-medium text-muted-foreground">
            {links.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                activeOptions={{ exact: l.to === "/dashboard" }}
                activeProps={{ className: "text-foreground" }}
                className="hover:text-foreground transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/tickets/new"
            className="hidden sm:inline-flex px-3 py-1.5 bg-foreground text-background text-xs font-semibold rounded-sm hover:bg-foreground/90 transition-colors"
          >
            Nueva incidencia
          </Link>
          {authenticated ? (
            <div className="flex items-center gap-2">
              <Link
                to="/profile"
                className="size-8 bg-muted border border-border rounded-sm flex items-center justify-center font-mono text-xs"
              >
                JP
              </Link>
              <button
                onClick={handleLogout}
                className="hidden sm:inline-flex px-3 py-1.5 border border-border text-xs font-semibold rounded-sm hover:bg-muted transition-colors"
              >
                Salir
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
