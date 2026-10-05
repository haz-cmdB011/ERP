// Etiqueta de estado con punto de color y texto (el color nunca va solo: quien
// no distingue colores lee el texto).
export type TonoChip = "ok" | "proceso" | "alerta" | "peligro" | "neutro";

const ESTILO: Record<TonoChip, { caja: string; punto: string }> = {
  ok: { caja: "bg-emerald-50 text-emerald-800 ring-emerald-200", punto: "bg-emerald-500" },
  proceso: { caja: "bg-sky-50 text-sky-800 ring-sky-200", punto: "bg-sky-500" },
  alerta: { caja: "bg-amber-50 text-amber-800 ring-amber-200", punto: "bg-amber-500" },
  peligro: { caja: "bg-rose-50 text-rose-800 ring-rose-200", punto: "bg-rose-500" },
  neutro: { caja: "bg-slate-100 text-slate-600 ring-slate-200", punto: "bg-slate-400" },
};

export default function ChipEstado({
  tono,
  children,
  titulo,
}: {
  tono: TonoChip;
  children: React.ReactNode;
  titulo?: string;
}) {
  const e = ESTILO[tono];
  return (
    <span
      title={titulo}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ${e.caja}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${e.punto}`} aria-hidden="true" />
      {children}
    </span>
  );
}
