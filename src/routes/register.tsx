import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { AuthLayout, Field, PrimaryButton } from "@/components/AuthLayout";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Crear cuenta — SmartTicket" },
      { name: "description", content: "Registra tu MYPE en SmartTicket y empieza a gestionar tu soporte hoy." },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          fullName: `${firstName.trim()} ${lastName.trim()}`.trim(),
          company,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        toast.error(payload?.message ?? "No se pudo crear la cuenta.");
        return;
      }

      toast.success(payload.message ?? "Revisa tu correo para verificar tu cuenta.");
      setFirstName("");
      setLastName("");
      setCompany("");
      setEmail("");
      setPassword("");
      navigate({ to: "/login" });
    } catch (error) {
      toast.error("Error de conexión. Intenta nuevamente.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      eyebrow="Nuevo registro"
      title="Crea tu cuenta MYPE"
      subtitle="Toma menos de 2 minutos. Sin tarjeta de crédito."
      footer={
        <>
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Inicia sesión
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit}>
        <div className="grid grid-cols-2 gap-4">
          <Field
            label="Nombres"
            placeholder="María"
            name="firstName"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            autoComplete="given-name"
            required
          />
          <Field
            label="Apellidos"
            placeholder="Quispe"
            name="lastName"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            autoComplete="family-name"
            required
          />
        </div>
        <Field
          label="Empresa / RUC"
          placeholder="Bodega La Unión S.A.C"
          name="company"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
          autoComplete="organization"
          required
        />
        <Field
          label="Correo corporativo"
          type="email"
          placeholder="contacto@empresa.pe"
          name="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
        />
        <Field
          label="Contraseña"
          type="password"
          placeholder="Mín. 8 caracteres"
          hint="Verificada contra brechas (HIBP)."
          name="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="new-password"
          required
        />
        <PrimaryButton>{submitting ? "Creando cuenta…" : "Crear cuenta"}</PrimaryButton>
        <p className="mt-4 text-[11px] text-muted-foreground text-center">
          Al continuar aceptas los Términos y la Política de Privacidad.
        </p>
      </form>
    </AuthLayout>
  );
}
