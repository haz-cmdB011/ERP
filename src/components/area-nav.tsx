import Link from "next/link";
import LogoutButton from "./logout-button";
import BotonRegresar from "./boton-regresar";
import BuscadorGlobal from "./buscador-global";
import SelectorTema from "./selector-tema";
import Marca from "./marca";
import Avatar from "./avatar";
import { urlAvatar } from "@/lib/cuenta/avatar";
import SubnavOrdenable from "./subnav-ordenable";

const INICIO_AREA = {
  planeacion: "/planeacion",
  produccion: "/produccion",
  calidad: "/calidad",
  estimaciones: "/estimaciones",
  usuarios: "/admin/usuarios",
} as const;

type Area = keyof typeof INICIO_AREA;

// Íconos de línea (24×24) de cada área.
const AREAS: { area: Area; href: string; nombre: string; icono: React.ReactNode }[] = [
  {
    area: "planeacion",
    href: "/planeacion",
    nombre: "Planeación",
    icono: (
      <>
        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
        <rect x="8" y="2" width="8" height="4" rx="1" />
        <path d="M9 12h6M9 16h6" />
      </>
    ),
  },
  {
    area: "produccion",
    href: "/produccion",
    nombre: "Producción",
    icono: (
      <>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
        <path d="m3.27 6.96 8.73 5.05 8.73-5.05" />
        <path d="M12 22.08V12" />
      </>
    ),
  },
  {
    area: "calidad",
    href: "/calidad",
    nombre: "Calidad",
    icono: (
      <>
        <path d="M12 3 4 6v6c0 4.5 3.2 7.7 8 9 4.8-1.3 8-4.5 8-9V6l-8-3Z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
  {
    area: "estimaciones",
    href: "/estimaciones",
    nombre: "Estimaciones",
    icono: (
      <>
        <rect x="5" y="2" width="14" height="20" rx="2" />
        <path d="M8 6h8" />
        <path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01" />
      </>
    ),
  },
  {
    area: "usuarios",
    href: "/admin/usuarios",
    nombre: "Usuarios",
    icono: (
      <>
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </>
    ),
  },
];

// Barra superior compartida entre las áreas de la app (Planeación,
// Producción...). Dos niveles separados a propósito: la barra oscura de
// arriba es la marca + el selector de área + la sesión; la fila clara de
// abajo son los links propios de la área activa (pasados como children,
// ej. "Pedidos" / "Cargar Excel" dentro de Planeación, con SubnavLink) — así
// quedan visualmente subordinados al área en vez de verse como paneles
// hermanos al mismo nivel que Planeación/Producción.
//
// En celular la barra oscura se parte en dos líneas (marca + acciones, y
// debajo las áreas con desplazamiento de lado); desde `xl` cabe en una.
export default async function AreaNav({
  area,
  email,
  userId,
  avatarPath,
  esDesarrollador = false,
  soloEstimaciones = false,
  porRevisar = 0,
  children,
}: {
  area: Area;
  email: string;
  // Para mostrar la foto de perfil (app_metadata.avatar_path del usuario).
  userId?: string;
  avatarPath?: unknown;
  // Usuarios es un panel más, pero solo para desarrolladores (acceso
  // global): las demás áreas no lo ven en su selector.
  esDesarrollador?: boolean;
  // Maquilador (usuario externo): solo existe Estimaciones para él, así que
  // no se le muestran las demás áreas ni el enlace a la cuenta de Planeación.
  soloEstimaciones?: boolean;
  // Recibos esperando revisión: se marca en la pestaña Estimaciones desde
  // cualquier área, para que se note sin entrar. 0 lo oculta.
  porRevisar?: number;
  children?: React.ReactNode;
}) {
  const visibles = AREAS.filter((a) => {
    if (soloEstimaciones) return a.area === "estimaciones";
    if (a.area === "usuarios") return esDesarrollador;
    return true;
  });
  const inicial = (email.trim()[0] ?? "?").toUpperCase();
  const avatarUrl = userId ? await urlAvatar(userId, avatarPath) : null;
  const hrefCuenta = soloEstimaciones ? "/estimaciones/cuenta" : "/planeacion/cuenta";

  return (
    <div className="print:hidden">
      <header className="border-b border-nav-line bg-nav pt-[env(safe-area-inset-top)] text-on-nav">
        <nav className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5 text-sm sm:px-6 xl:flex-nowrap">
          <Link
            href={soloEstimaciones ? "/estimaciones/recibos" : "/planeacion"}
            className="shrink-0 rounded-lg focus-visible:outline-brand-500"
            aria-label="Mobiliarium, ir al inicio"
          >
            <Marca sobreOscuro />
          </Link>

          {/* Acciones de sesión: a la derecha de la marca en celular, al final
              de la fila desde xl (order cambia de lugar la fila de áreas). */}
          <div className="order-2 ml-auto flex shrink-0 items-center gap-0.5 sm:gap-1.5 xl:order-3">
            <BuscadorGlobal area={area} />
            <SelectorTema />
            <Link
              href={hrefCuenta}
              className="inline-flex shrink-0 items-center gap-2 rounded-lg p-1 text-on-nav-suave transition-colors hover:bg-nav-hover hover:text-on-nav focus-visible:outline-brand-500"
              title={`Mi perfil (${email})`}
            >
              <Avatar
                url={avatarUrl}
                inicial={inicial}
                tamano="h-7 w-7 sm:h-8 sm:w-8"
              />
              <span className="sr-only xl:not-sr-only xl:max-w-44 xl:truncate">{email}</span>
            </Link>
            <LogoutButton />
          </div>

          <div className="desplazable-sin-barra order-3 -mx-1 flex min-w-0 basis-full items-center gap-1 overflow-x-auto whitespace-nowrap px-1 py-0.5 xl:order-2 xl:mx-0 xl:basis-auto xl:flex-1 xl:px-3">
            {visibles.map((a) => (
              <Link
                key={a.area}
                href={a.href}
                aria-current={area === a.area ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 font-semibold transition-colors focus-visible:outline-brand-500 ${
                  area === a.area
                    ? "bg-brand-500 text-on-brand shadow-sm"
                    : "text-on-nav-suave hover:bg-nav-hover hover:text-on-nav"
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 shrink-0"
                  aria-hidden="true"
                >
                  {a.icono}
                </svg>
                {a.nombre}
                {a.area === "estimaciones" && porRevisar > 0 && (
                  <span
                    className="anim-aviso ml-0.5 min-w-5 rounded-full bg-rose-600 px-1.5 py-0.5 text-center text-[10px] font-bold leading-none text-white"
                    title={`${porRevisar} recibo${porRevisar === 1 ? "" : "s"} por revisar`}
                  >
                    {porRevisar > 99 ? "99+" : porRevisar}
                    <span className="sr-only"> recibos por revisar</span>
                  </span>
                )}
              </Link>
            ))}
          </div>
        </nav>
      </header>
      {children && (
        <div className="border-b border-slate-200 bg-white">
          <SubnavOrdenable clave={`${area}:${userId ?? ""}`}>{children}</SubnavOrdenable>
        </div>
      )}
      {/* Debajo de las áreas y los paneles, a la altura del contenido: vuelve
          al panel anterior (oculto en el inicio del área). */}
      <BotonRegresar
        inicioArea={soloEstimaciones ? "/estimaciones/recibos" : INICIO_AREA[area]}
        maquilador={soloEstimaciones}
      />
    </div>
  );
}
