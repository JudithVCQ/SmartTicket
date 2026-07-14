import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthLayout, Field, PrimaryButton } from "@/components/AuthLayout";

export const Route = createFileRoute("/forgot-password")({
  head: () => ({
    meta: [
      { title: "Recuperar contraseña — SmartTicket" },
      { name: "description", content: "Recupera el acceso a tu cuenta de SmartTicket." },
    ],
  }),
  component: ForgotPage,
});

function ForgotPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const payload = await response.json();
      toast.success(payload.message ?? "Si existe el correo, recibirás un enlace por Gmail.");
      if (response.ok) {
        setEmail("");
      }
    } catch (error) {
      toast.error("No se pudo enviar la solicitud. Intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Recuperar acceso"
      title="¿Olvidaste tu contraseña?"
      subtitle="Te enviaremos un enlace seguro para restablecerla."
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          ← Volver a iniciar sesión
        </Link>
      }
    >
      <form onSubmit={onSubmit}>
        <Field
          label="Correo registrado"
          type="email"
          placeholder="contacto@empresa.pe"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
        <PrimaryButton>{submitting ? "Enviando…" : "Enviar enlace"}</PrimaryButton>
      </form>
    </AuthLayout>
  );
}
