import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthLayout, Field, PrimaryButton } from "@/components/AuthLayout";
import { setAuthSession } from "@/lib/auth-session";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Iniciar sesión — SmartTicket" },
      { name: "description", content: "Accede a tu panel de SmartTicket para gestionar tickets de soporte." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const payload = await response.json();

      if (!response.ok) {
        toast.error(payload?.message ?? "Credenciales incorrectas.");
        return;
      }

      toast.success(payload.message ?? "Sesión iniciada.");
      setAuthSession(email, payload.user, payload.token);
      setEmail("");
      setPassword("");
      navigate({ to: "/dashboard" });
    } catch (error) {
      toast.error("Error de conexión. Intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Acceso seguro"
      title="Inicia sesión"
      subtitle="Continúa gestionando el soporte de tu MYPE."
      footer={
        <>
          ¿Aún no tienes cuenta?{" "}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Regístrate gratis
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <Field
          label="Correo corporativo"
          type="email"
          placeholder="contacto@mypeperu.com"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
        <Field
          label="Contraseña"
          type="password"
          placeholder="••••••••"
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
        <div className="flex justify-end mb-6 -mt-2">
          <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-foreground">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <PrimaryButton>{submitting ? "Iniciando…" : "Entrar al panel"}</PrimaryButton>
        <div className="mt-6 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          Conexión cifrada · JWT
        </div>
      </form>
    </AuthLayout>
  );
}
