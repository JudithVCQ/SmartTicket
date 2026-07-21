import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { getAuthSession } from "@/lib/auth-session";
import { slaPorPrioridad } from "@/lib/mock-data";
import { CATEGORY_OPTIONS } from "@/lib/tickets-store";

export const Route = createFileRoute("/organizacion")({
  head: () => ({
    meta: [
      { title: "Organización — SmartTicket" },
      {
        name: "description",
        content: "Configuración general de la organización: categorías, SLA y notificaciones.",
      },
    ],
  }),
  component: OrganizacionPage,
});

function OrganizacionPage() {
  const auth = getAuthSession();

  const [nombreOrg, setNombreOrg] = useState(auth?.organizationName ?? "");
  const [dominio, setDominio] = useState(auth?.email ? (auth.email.split("@")[1] ?? "") : "");

  const [categorias, setCategorias] = useState<string[]>([...CATEGORY_OPTIONS]);
  const [nuevaCategoria, setNuevaCategoria] = useState("");

  const [slaHoras, setSlaHoras] = useState<Record<string, number>>(() => {
    const base: Record<string, number> = { Crítica: 4, Alta: 8, Media: 24, Baja: 48 };
    return base;
  });

  const [notifEmail, setNotifEmail] = useState(true);
  const [notifSlaVencido, setNotifSlaVencido] = useState(true);
  const [notifNuevoTicket, setNotifNuevoTicket] = useState(false);

  const slaResumen = useMemo(() => slaPorPrioridad, []);

  const handleAddCategoria = () => {
    const value = nuevaCategoria.trim();
    if (!value) return;
    if (categorias.some((c) => c.toLowerCase() === value.toLowerCase())) {
      toast.error("Esa categoría ya existe.");
      return;
    }
    setCategorias((prev) => [...prev, value]);
    setNuevaCategoria("");
  };

  const handleRemoveCategoria = (cat: string) => {
    setCategorias((prev) => prev.filter((c) => c !== cat));
  };

  const handleSave = (e: FormEvent) => {
    e.preventDefault();
    toast.success("Configuración de la organización guardada.");
  };

  return (
    <div className="min-h-screen">
      <AppNav />
      <form onSubmit={handleSave} className="max-w-7xl mx-auto px-6 py-12">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 animate-reveal">
          <div>
            <div className="text-xs font-mono text-primary uppercase tracking-widest mb-2">
              Organización
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">
              Configuración de organización
            </h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              Datos generales, categorías de tickets, tiempos de SLA y notificaciones.
            </p>
          </div>
          <Button type="submit" className="rounded-sm">
            Guardar cambios
          </Button>
        </header>

        <div className="grid gap-8 lg:grid-cols-2">
          {/* Datos generales */}
          <section
            className="border border-border bg-card rounded-sm p-8 animate-reveal"
            style={{ animationDelay: "50ms" }}
          >
            <h2 className="font-bold uppercase tracking-wide text-xs text-muted-foreground mb-6">
              Datos generales
            </h2>
            <div className="grid gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="nombreOrg">Nombre de la organización</Label>
                <Input
                  id="nombreOrg"
                  value={nombreOrg}
                  onChange={(e) => setNombreOrg(e.target.value)}
                  placeholder="Ej. Acme Corp"
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="dominio">Dominio de correo corporativo</Label>
                <Input
                  id="dominio"
                  value={dominio}
                  onChange={(e) => setDominio(e.target.value)}
                  placeholder="empresa.com"
                />
              </div>
            </div>
          </section>

          {/* Categorías */}
          <section
            className="border border-border bg-card rounded-sm p-8 animate-reveal"
            style={{ animationDelay: "100ms" }}
          >
            <h2 className="font-bold uppercase tracking-wide text-xs text-muted-foreground mb-6">
              Categorías de tickets
            </h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {categorias.map((c) => (
                <span
                  key={c}
                  className="flex items-center gap-2 px-3 py-1.5 border border-border rounded-sm text-sm"
                >
                  {c}
                  <button
                    type="button"
                    onClick={() => handleRemoveCategoria(c)}
                    aria-label={`Quitar categoría ${c}`}
                    className="text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={nuevaCategoria}
                onChange={(e) => setNuevaCategoria(e.target.value)}
                placeholder="Nueva categoría"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddCategoria();
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                className="rounded-sm shrink-0"
                onClick={handleAddCategoria}
              >
                <Plus className="size-4" />
                Añadir
              </Button>
            </div>
          </section>

          {/* SLA por prioridad */}
          <section
            className="border border-border bg-card rounded-sm p-8 animate-reveal lg:col-span-2"
            style={{ animationDelay: "150ms" }}
          >
            <h2 className="font-bold uppercase tracking-wide text-xs text-muted-foreground mb-6">
              Tiempos de SLA por prioridad
            </h2>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {slaResumen.map((s) => (
                <div key={s.prioridad} className="border border-border rounded-sm p-4">
                  <div className="text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2">
                    {s.prioridad}
                  </div>
                  <div className="flex items-center gap-2 mb-3">
                    <Input
                      type="number"
                      min={1}
                      value={slaHoras[s.prioridad]}
                      onChange={(e) =>
                        setSlaHoras((prev) => ({
                          ...prev,
                          [s.prioridad]: Number(e.target.value) || 1,
                        }))
                      }
                      className="w-20"
                    />
                    <span className="text-sm text-muted-foreground">horas</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground font-mono">
                    Cumplimiento actual: {s.pct}%
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Notificaciones */}
          <section
            className="border border-border bg-card rounded-sm p-8 animate-reveal lg:col-span-2"
            style={{ animationDelay: "200ms" }}
          >
            <h2 className="font-bold uppercase tracking-wide text-xs text-muted-foreground mb-6">
              Notificaciones
            </h2>
            <div className="flex flex-col divide-y divide-border">
              <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                <div>
                  <div className="font-medium text-sm">Resumen diario por correo</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Envía un resumen de la actividad del equipo cada mañana.
                  </p>
                </div>
                <Switch checked={notifEmail} onCheckedChange={setNotifEmail} />
              </div>
              <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                <div>
                  <div className="font-medium text-sm">Alertas de SLA vencido</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Notifica al supervisor cuando un ticket incumple su SLA.
                  </p>
                </div>
                <Switch checked={notifSlaVencido} onCheckedChange={setNotifSlaVencido} />
              </div>
              <div className="flex items-center justify-between py-4 first:pt-0 last:pb-0">
                <div>
                  <div className="font-medium text-sm">Nuevo ticket creado</div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Notifica al equipo cada vez que ingresa una nueva incidencia.
                  </p>
                </div>
                <Switch checked={notifNuevoTicket} onCheckedChange={setNotifNuevoTicket} />
              </div>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
