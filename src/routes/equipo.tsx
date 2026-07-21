import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Plus, Mail, Trash2 } from "lucide-react";
import { AppNav } from "@/components/AppNav";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useTeam, ROLE_OPTIONS, ESPECIALIDAD_OPTIONS, type TeamRole } from "@/lib/team-store";
import { useTickets } from "@/lib/tickets-store";

export const Route = createFileRoute("/equipo")({
  head: () => ({
    meta: [
      { title: "Equipo — SmartTicket" },
      {
        name: "description",
        content: "Gestión de técnicos: rendimiento, SLA, CSAT y alta de nuevos miembros.",
      },
    ],
  }),
  component: EquipoPage,
});

function EquipoPage() {
  const { miembros, addMiembro, removeMiembro, toggleEstado } = useTeam();
  const { tickets } = useTickets();
  const [open, setOpen] = useState(false);

  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [rol, setRol] = useState<TeamRole>("Técnico");
  const [especialidad, setEspecialidad] = useState(ESPECIALIDAD_OPTIONS[0]);

  const ticketsAbiertosPorTecnico = useMemo(() => {
    const map: Record<string, number> = {};
    for (const t of tickets) {
      if (t.estado === "Cerrado" || t.estado === "Resuelto") continue;
      const key = t.tecnico || "Sin asignar";
      map[key] = (map[key] ?? 0) + 1;
    }
    return map;
  }, [tickets]);

  const stats = useMemo(() => {
    const activos = miembros.filter((m) => m.estado === "Activo");
    const slaProm = activos.length
      ? Math.round(activos.reduce((acc, m) => acc + m.slaCumplimiento, 0) / activos.length)
      : 0;
    const csatProm = activos.length
      ? (activos.reduce((acc, m) => acc + m.csat, 0) / activos.length).toFixed(1)
      : "0.0";
    const totalResueltos = miembros.reduce((acc, m) => acc + m.resueltos, 0);
    return { total: miembros.length, activos: activos.length, slaProm, csatProm, totalResueltos };
  }, [miembros]);

  const resetForm = () => {
    setNombre("");
    setEmail("");
    setRol("Técnico");
    setEspecialidad(ESPECIALIDAD_OPTIONS[0]);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!nombre.trim() || !email.trim()) {
      toast.error("Nombre y correo son obligatorios.");
      return;
    }
    const nuevo = addMiembro({ nombre, email, rol, especialidad });
    toast.success(`${nuevo.nombre} añadido al equipo.`);
    resetForm();
    setOpen(false);
  };

  const handleRemove = (id: string, nombre: string) => {
    if (!window.confirm(`¿Quitar a "${nombre}" del equipo?`)) return;
    removeMiembro(id);
    toast.success("Técnico eliminado.");
  };

  return (
    <div className="min-h-screen">
      <AppNav />
      <main className="max-w-7xl mx-auto px-6 py-12">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-10 animate-reveal">
          <div>
            <div className="text-xs font-mono text-primary uppercase tracking-widest mb-2">
              Equipo
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight">Gestión de técnicos</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-xl">
              Rendimiento, SLA y CSAT de cada miembro del equipo de soporte.
            </p>
          </div>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button className="rounded-sm">
                <Plus className="size-4" />
                Añadir técnico
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <form onSubmit={handleSubmit}>
                <DialogHeader>
                  <DialogTitle>Añadir nuevo técnico</DialogTitle>
                  <DialogDescription>
                    Se enviará una invitación por correo para que active su cuenta.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                  <div className="grid gap-1.5">
                    <Label htmlFor="nombre">Nombre completo</Label>
                    <Input
                      id="nombre"
                      value={nombre}
                      onChange={(e) => setNombre(e.target.value)}
                      placeholder="Ej. María Fernández"
                      required
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="email">Correo electrónico</Label>
                    <Input
                      id="email"
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="maria.fernandez@empresa.com"
                      required
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="grid gap-1.5">
                      <Label>Rol</Label>
                      <Select value={rol} onValueChange={(v) => setRol(v as TeamRole)}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-1.5">
                      <Label>Especialidad</Label>
                      <Select value={especialidad} onValueChange={setEspecialidad}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ESPECIALIDAD_OPTIONS.map((e) => (
                            <SelectItem key={e} value={e}>
                              {e}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="submit" className="rounded-sm">
                    Enviar invitación
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </header>

        {/* Stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12">
          <div className="p-6 border border-border bg-card rounded-sm animate-reveal">
            <div className="text-xs font-mono text-muted-foreground uppercase mb-4 tracking-wider">
              Técnicos activos
            </div>
            <div className="text-3xl font-bold tracking-tight">
              {stats.activos}
              <span className="text-base text-muted-foreground font-medium"> / {stats.total}</span>
            </div>
          </div>
          <div
            className="p-6 border border-border bg-card rounded-sm animate-reveal"
            style={{ animationDelay: "50ms" }}
          >
            <div className="text-xs font-mono text-muted-foreground uppercase mb-4 tracking-wider">
              Tickets resueltos
            </div>
            <div className="text-3xl font-bold tracking-tight">{stats.totalResueltos}</div>
          </div>
          <div
            className="p-6 border border-border bg-card rounded-sm animate-reveal"
            style={{ animationDelay: "100ms" }}
          >
            <div className="text-xs font-mono text-muted-foreground uppercase mb-4 tracking-wider">
              SLA promedio
            </div>
            <div className="text-3xl font-bold tracking-tight">{stats.slaProm}%</div>
          </div>
          <div
            className="p-6 border border-border bg-card rounded-sm animate-reveal"
            style={{ animationDelay: "150ms" }}
          >
            <div className="text-xs font-mono text-muted-foreground uppercase mb-4 tracking-wider">
              CSAT promedio
            </div>
            <div className="text-3xl font-bold tracking-tight">{stats.csatProm}</div>
          </div>
        </div>

        {/* Team table */}
        <section
          className="border border-border bg-card rounded-sm overflow-hidden animate-reveal"
          style={{ animationDelay: "200ms" }}
        >
          <div className="p-6 border-b border-border">
            <h2 className="font-bold uppercase tracking-wide text-xs text-muted-foreground">
              Miembros del equipo
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-6 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Técnico
                  </th>
                  <th className="px-6 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Rol / Especialidad
                  </th>
                  <th className="px-6 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Abiertos
                  </th>
                  <th className="px-6 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Resueltos
                  </th>
                  <th className="px-6 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    SLA
                  </th>
                  <th className="px-6 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    CSAT
                  </th>
                  <th className="px-6 py-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Estado
                  </th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody>
                {miembros.map((m) => (
                  <tr key={m.id} className="border-b border-border/70 last:border-b-0">
                    <td className="px-6 py-4">
                      <div className="font-semibold">{m.nombre}</div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <Mail className="size-3" />
                        {m.email}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {m.rol} · {m.especialidad}
                    </td>
                    <td className="px-6 py-4 font-mono">
                      {ticketsAbiertosPorTecnico[m.nombre] ?? 0}
                    </td>
                    <td className="px-6 py-4 font-mono">{m.resueltos}</td>
                    <td className="px-6 py-4 font-mono">{m.slaCumplimiento}%</td>
                    <td className="px-6 py-4 font-mono">{m.csat.toFixed(1)}</td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => toggleEstado(m.id)}
                        className={`px-2 py-1 text-[10px] font-bold uppercase tracking-wider border rounded-sm transition-colors ${
                          m.estado === "Activo"
                            ? "bg-success/10 text-success border-success/20"
                            : "bg-muted text-muted-foreground border-border"
                        }`}
                      >
                        {m.estado}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleRemove(m.id, m.nombre)}
                        aria-label={`Eliminar a ${m.nombre}`}
                        className="text-muted-foreground hover:text-destructive transition-colors"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
