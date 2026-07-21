import { type ReactNode, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { LayoutDashboard, Ticket, Headset, Users, Settings, LogOut, Menu } from "lucide-react";
import { clearAuthSession } from "@/lib/auth-session";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const navLinks = [
  { to: "/dashboard", label: "Inicio", icon: LayoutDashboard },
  { to: "/tickets", label: "Tickets", icon: Ticket },
  { to: "/tecnico", label: "Operaciones", icon: Headset },
  { to: "/equipo", label: "Equipo", icon: Users },
  { to: "/organizacion", label: "Organización", icon: Settings },
] as const;

function SidebarLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <ul className="flex-1 py-4 flex flex-col gap-1 px-3 font-mono text-xs uppercase tracking-wider">
      {navLinks.map((l) => {
        const Icon = l.icon;
        return (
          <li key={l.to}>
            <Link
              to={l.to}
              onClick={onNavigate}
              activeOptions={{ exact: l.to === "/dashboard" }}
              activeProps={{ className: "bg-foreground text-background" }}
              className="flex items-center gap-3 text-muted-foreground px-4 py-2.5 rounded-sm hover:bg-muted hover:text-foreground transition-colors"
            >
              <Icon className="size-4 shrink-0" />
              {l.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * Layout de administración con barra lateral fija (desktop) y menú tipo drawer (mobile).
 * Se usa únicamente en las pantallas de gestión: /equipo y /organizacion.
 * El resto de la app sigue usando <AppNav /> (barra superior).
 */
export function AdminSidebar({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    clearAuthSession();
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar (desktop) */}
      <nav className="hidden md:flex flex-col h-screen sticky top-0 w-64 shrink-0 border-r border-border bg-card z-20">
        <div className="p-6 border-b border-border">
          <Link to="/dashboard" className="font-mono font-bold tracking-tighter text-lg block">
            SMART<span className="text-primary">TICKET</span>
          </Link>
          <p className="font-mono text-[10px] text-muted-foreground mt-1 uppercase tracking-widest">
            Panel de administración
          </p>
        </div>
        <SidebarLinks />
        <div className="p-3 border-t border-border">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 text-muted-foreground px-4 py-2.5 rounded-sm hover:bg-muted hover:text-foreground transition-colors font-mono text-xs uppercase tracking-wider"
          >
            <LogOut className="size-4 shrink-0" />
            Salir
          </button>
        </div>
      </nav>

      {/* Top bar (mobile) */}
      <header className="md:hidden sticky top-0 z-20 w-full h-16 border-b border-border bg-background/90 backdrop-blur-md flex items-center justify-between px-4">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              aria-label="Abrir menú"
              className="size-9 flex items-center justify-center rounded-sm border border-border"
            >
              <Menu className="size-4" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-0 flex flex-col">
            <div className="p-6 border-b border-border">
              <span className="font-mono font-bold tracking-tighter text-lg">
                SMART<span className="text-primary">TICKET</span>
              </span>
            </div>
            <SidebarLinks onNavigate={() => setMobileOpen(false)} />
            <div className="p-3 border-t border-border">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 text-muted-foreground px-4 py-2.5 rounded-sm hover:bg-muted hover:text-foreground transition-colors font-mono text-xs uppercase tracking-wider"
              >
                <LogOut className="size-4 shrink-0" />
                Salir
              </button>
            </div>
          </SheetContent>
        </Sheet>
        <span className="font-mono font-bold tracking-tighter text-base">
          SMART<span className="text-primary">TICKET</span>
        </span>
        <div className="size-9" />
      </header>

      {/* Main content */}
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
