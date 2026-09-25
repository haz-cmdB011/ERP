"use client";

// Heurística simple (longitud + variedad de tipos de caracter), 0-5 puntos.
// No exige nada por sí sola: es feedback visual para que el trabajador
// ajuste su contraseña antes de enviar el formulario.
function calcularPuntaje(password: string): number {
  if (!password) return 0;
  let puntaje = 0;
  if (password.length >= 8) puntaje++;
  if (password.length >= 12) puntaje++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) puntaje++;
  if (/[0-9]/.test(password)) puntaje++;
  if (/[^A-Za-z0-9]/.test(password)) puntaje++;
  return puntaje;
}

const NIVELES = [
  { etiqueta: "Muy débil", color: "#dc2626" },
  { etiqueta: "Débil", color: "#ea580c" },
  { etiqueta: "Aceptable", color: "#eab308" },
  { etiqueta: "Fuerte", color: "#84cc16" },
  { etiqueta: "Muy fuerte", color: "#16a34a" },
] as const;

export default function PasswordStrengthMeter({ password }: { password: string }) {
  const puntaje = calcularPuntaje(password);
  const nivel = NIVELES[Math.max(puntaje - 1, 0)];
  const porcentaje = (puntaje / 5) * 100;

  return (
    <div className="flex flex-col gap-1">
      <div className="h-1.5 w-full overflow-hidden rounded bg-gray-200">
        <div
          className="h-full rounded transition-all"
          style={{
            width: `${porcentaje}%`,
            backgroundColor: password ? nivel.color : "transparent",
          }}
        />
      </div>
      {password && (
        <p className="text-xs" style={{ color: nivel.color }}>
          Seguridad: {nivel.etiqueta}
        </p>
      )}
    </div>
  );
}
