import { Link } from "@tanstack/react-router";
import type { ChangeEvent, ReactNode } from "react";

export function AuthLayout({
  eyebrow,
  title,
  subtitle,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="font-mono font-bold tracking-tighter text-xl">
            SMART<span className="text-primary">TICKET</span>
          </Link>
          <span className="font-mono text-[10px] text-muted-foreground uppercase tracking-widest">
            v4.2.0
          </span>
        </div>
      </header>
      <main className="flex-1 grid place-items-center px-6 py-16">
        <div className="w-full max-w-md animate-reveal">
          <div className="text-xs font-mono text-primary uppercase tracking-widest mb-2">
            {eyebrow}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-balance mb-2">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground mb-8">{subtitle}</p>}
          <div className="border border-border bg-card p-8 rounded-sm">{children}</div>
          {footer && <div className="mt-6 text-sm text-muted-foreground">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function Field({
  label,
  type = "text",
  placeholder,
  hint,
  value,
  onChange,
  name,
  autoComplete,
  required,
}: {
  label: string;
  type?: string;
  placeholder?: string;
  hint?: string;
  value?: string;
  onChange?: (event: ChangeEvent<HTMLInputElement>) => void;
  name?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <label className="block mb-5">
      <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        required={required}
        placeholder={placeholder}
        className="mt-2 w-full h-10 px-3 bg-background border border-border rounded-sm text-sm focus:outline-none focus:border-foreground transition-colors"
      />
      {hint && <span className="block mt-1.5 text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function PrimaryButton({ children }: { children: ReactNode }) {
  return (
    <button className="w-full h-10 bg-foreground text-background text-sm font-semibold rounded-sm hover:bg-foreground/90 transition-colors">
      {children}
    </button>
  );
}
