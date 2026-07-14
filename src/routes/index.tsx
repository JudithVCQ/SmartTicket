import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SmartTicket — Acceso" },
      { name: "description", content: "Inicia sesión o crea tu cuenta en SmartTicket." },
    ],
  }),
  component: HomeRedirect,
});

function HomeRedirect() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-md border border-border bg-card p-8 rounded-sm text-center">
        <div className="text-xs font-mono uppercase tracking-widest text-primary mb-3">SmartTicket</div>
        <h1 className="text-3xl font-extrabold tracking-tight">Accede a tu cuenta</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Para continuar, inicia sesión o crea una cuenta nueva.
        </p>
        <div className="mt-8 flex flex-col gap-3">
          <Link
            to="/login"
            className="w-full h-10 flex items-center justify-center bg-foreground text-background text-sm font-semibold rounded-sm hover:bg-foreground/90 transition-colors"
          >
            Iniciar sesión
          </Link>
          <Link
            to="/register"
            className="w-full h-10 flex items-center justify-center border border-border text-foreground text-sm font-semibold rounded-sm hover:bg-muted transition-colors"
          >
            Crear cuenta
          </Link>
        </div>
      </div>
    </div>
  );
}
