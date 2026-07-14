import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AppNav } from "@/components/AppNav";
import { clearAuthSession, getAuthSession, setAuthSession } from "@/lib/auth-session";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Mi perfil — SmartTicket" },
      { name: "description", content: "Gestiona tu cuenta y datos personales en SmartTicket." },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const navigate = useNavigate();
  const [name, setName] = useState("Usuario SmartTicket");
  const [company, setCompany] = useState("Nueva organización");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const auth = getAuthSession();
      if (!auth?.token) {
        if (auth?.email) {
          setEmail(auth.email);
        }
        return;
      }

      try {
        const response = await fetch("/api/auth/profile", {
          headers: { authorization: `Bearer ${auth.token}` },
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(payload?.message ?? "No se pudo cargar el perfil.");
        }

        const profile = payload?.user;
        setName(profile?.fullName || "Usuario SmartTicket");
        setCompany(profile?.company || "Nueva organización");
        setEmail(profile?.email || auth.email || "");
        setAuthSession(profile?.email || auth.email || undefined, {
          fullName: profile?.fullName || null,
          company: profile?.company || null,
          organizationName: profile?.organizationName || null,
          organizationId: profile?.organizationId || null,
          role: profile?.role || null,
        }, auth.token);
      } catch {
        toast.error("No se pudo cargar tu perfil desde la base de datos.");
      }
    };

    void loadProfile();
  }, []);

  const handleSave = async () => {
    const auth = getAuthSession();
    if (!auth?.token) {
      toast.error("Tu sesión ya no es válida. Inicia sesión nuevamente.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/auth/profile", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${auth.token}`,
        },
        body: JSON.stringify({ email, fullName: name, company }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.message ?? "No se pudo actualizar el perfil.");
      }

      setAuthSession(email || undefined, {
        fullName: name,
        company,
        organizationName: auth.organizationName || null,
        organizationId: auth.organizationId || null,
        role: auth.role || null,
      }, auth.token);
      toast.success(payload?.message ?? "Tus datos se actualizaron correctamente.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo guardar el perfil.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = () => {
    clearAuthSession();
    toast.success("Sesión cerrada.");
    navigate({ to: "/login" });
  };

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <div className="text-xs font-mono text-primary uppercase tracking-widest mb-2">Mi cuenta</div>
          <h1 className="text-3xl font-extrabold tracking-tight">Perfil y configuración</h1>
          <p className="text-sm text-muted-foreground mt-2">Administra tus datos y controla tu sesión.</p>
        </div>

        <div className="border border-border bg-card rounded-sm p-8 space-y-6">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Nombre</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full h-10 px-3 bg-background border border-border rounded-sm text-sm"
              />
            </label>
            <label className="block">
              <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Correo</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full h-10 px-3 bg-background border border-border rounded-sm text-sm"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Organización</span>
            <input
              value={company}
              onChange={(event) => setCompany(event.target.value)}
              className="mt-2 w-full h-10 px-3 bg-background border border-border rounded-sm text-sm"
            />
          </label>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleSave}
              className="px-5 py-2.5 bg-foreground text-background text-sm font-semibold rounded-sm hover:bg-foreground/90 transition-colors"
            >
              Guardar cambios
            </button>
            <button
              onClick={handleLogout}
              className="px-5 py-2.5 border border-border text-sm font-semibold rounded-sm hover:bg-muted transition-colors"
            >
              Cerrar sesión
            </button>
            <Link to="/" className="px-5 py-2.5 border border-border text-sm font-semibold rounded-sm hover:bg-muted transition-colors">
              Volver al inicio
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
