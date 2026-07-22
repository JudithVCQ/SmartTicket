import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AppNav } from "@/components/AppNav";
import { authHeaders } from "@/lib/tickets-store";
import { getAuthSession } from "@/lib/auth-session";
import type { Role } from "@/lib/roles";

export const Route = createFileRoute("/organigrama")({
  head: () => ({
    meta: [
      { title: "Organigrama — SmartTicket" },
      {
        name: "description",
        content: "Estructura de la organización: quién administra, quién atiende y quién reporta.",
      },
    ],
  }),
  component: OrganigramaPage,
});

interface Miembro {
  id: string;
  nombre: string;
  email: string;
  rol: Role;
  abiertosAsignados: number;
  totalAsignados: number;
  totalReportados: number;
}

const ROL_ETIQUETA: Record<Role, string> = {
  owner: "Administra",
  tech: "Atiende",
  member: "Reporta",
};

function OrganigramaPage() {
  const [miembros, setMiembros] = useState<Miembro[] | null>(null);
  const organizacion = getAuthSession()?.organizationName ?? "Tu organización";

  useEffect(() => {
    fetch("/api/org/members", { headers: authHeaders() })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setMiembros(Array.isArray(data) ? data : []))
      .catch(() => setMiembros([]));
  }, []);

  const { owners, tecnicos, solicitantes } = useMemo(() => {
    const lista = miembros ?? [];
    return {
      owners: lista.filter((m) => m.rol === "owner"),
      tecnicos: lista.filter((m) => m.rol === "tech"),
      solicitantes: lista.filter((m) => m.rol === "member"),
    };
  }, [miembros]);

  const cargaTotal = tecnicos.reduce((suma, t) => suma + t.abiertosAsignados, 0);

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="max-w-5xl mx-auto px-6 py-12">
        <header className="mb-12 animate-reveal">
          <div className="text-xs font-mono text-primary uppercase tracking-widest mb-2">
            Estructura
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight">Organigrama</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-xl">
            Quién administra, quién atiende la cola y quién reporta incidencias en {organizacion}.
          </p>
        </header>

        {miembros === null ? (
          <p className="text-sm text-muted-foreground">Cargando estructura…</p>
        ) : miembros.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay personas registradas en esta organización.
          </p>
        ) : (
          <div className="flex flex-col items-center">
            <Nivel etiqueta="Administración" total={owners.length} />
            <Fila>
              {owners.map((m) => (
                <Nodo key={m.id} miembro={m} destacado />
              ))}
            </Fila>

            {tecnicos.length > 0 && (
              <>
                <Conector />
                <Nivel
                  etiqueta="Equipo de soporte"
                  total={tecnicos.length}
                  nota={`${cargaTotal} tickets abiertos en total`}
                />
                <Fila>
                  {tecnicos.map((m) => (
                    <Nodo key={m.id} miembro={m} />
                  ))}
                </Fila>
              </>
            )}

            {solicitantes.length > 0 && (
              <>
                <Conector />
                <Nivel etiqueta="Solicitantes" total={solicitantes.length} />
                <Fila>
                  {solicitantes.map((m) => (
                    <Nodo key={m.id} miembro={m} compacto />
                  ))}
                </Fila>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function Nivel({ etiqueta, total, nota }: { etiqueta: string; total: number; nota?: string }) {
  return (
    <div className="text-center mb-4">
      <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {etiqueta} · {total}
      </div>
      {nota && <div className="text-[10px] text-muted-foreground mt-0.5">{nota}</div>}
    </div>
  );
}

/** Línea vertical que une un nivel con el siguiente. */
function Conector() {
  return <div className="w-px h-10 bg-border" />;
}

function Fila({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap justify-center gap-4 mb-10">{children}</div>;
}

function Nodo({
  miembro,
  destacado = false,
  compacto = false,
}: {
  miembro: Miembro;
  destacado?: boolean;
  compacto?: boolean;
}) {
  const iniciales = miembro.nombre
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();

  return (
    <div
      className={`border rounded-sm p-4 animate-reveal ${compacto ? "w-44" : "w-56"} ${
        destacado ? "border-foreground bg-foreground text-background" : "border-border bg-card"
      }`}
    >
      <div className="flex items-center gap-3">
        <div
          className={`size-8 shrink-0 rounded-sm flex items-center justify-center font-mono text-[10px] font-bold ${
            destacado ? "bg-background/20" : "bg-muted"
          }`}
        >
          {iniciales}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm truncate">{miembro.nombre}</div>
          <div
            className={`text-[10px] font-mono uppercase tracking-wider ${
              destacado ? "text-background/70" : "text-muted-foreground"
            }`}
          >
            {ROL_ETIQUETA[miembro.rol]}
          </div>
        </div>
      </div>

      <div
        className={`mt-3 pt-3 border-t text-[11px] ${
          destacado
            ? "border-background/20 text-background/80"
            : "border-border text-muted-foreground"
        }`}
      >
        {miembro.rol === "member" ? (
          <span>{miembro.totalReportados} reportados</span>
        ) : (
          <span>
            {miembro.abiertosAsignados} abiertos · {miembro.totalAsignados} atendidos
          </span>
        )}
      </div>
    </div>
  );
}
