import type { Metadata } from "next";
import Link from "next/link";
import Marca from "@/components/marca";

export const metadata: Metadata = { title: "Aviso de privacidad" };

// BORRADOR para revisión de quien corresponda en la empresa (representante
// legal / responsable de datos personales). Describe lo que el sistema hace de
// verdad con los datos; los datos del responsable se completan con variables de
// entorno (ver .env.example) para no inventarlos aquí.
const RESPONSABLE = process.env.NEXT_PUBLIC_PRIVACIDAD_RESPONSABLE?.trim() || "Mobiliarium";
const CORREO = process.env.NEXT_PUBLIC_PRIVACIDAD_CORREO?.trim() || null;
const ACTUALIZADO = "7 de octubre de 2026";

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-slate-900">{titulo}</h2>
      <div className="mt-2 space-y-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export default function PrivacidadPage() {
  return (
    <>
      <header className="bg-nav px-6 pb-5 pt-[max(1.25rem,env(safe-area-inset-top))] text-on-nav sm:px-10">
        <Link href="/" aria-label="Ir al inicio" className="inline-block">
          <Marca sobreOscuro className="h-11 sm:h-12" />
        </Link>
      </header>
      <main className="pie-seguro mx-auto w-full max-w-3xl px-6 py-10 sm:px-10">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Aviso de privacidad</h1>
        <p className="mt-2 text-sm text-slate-600">Última actualización: {ACTUALIZADO}</p>

        <Seccion titulo="Quién es el responsable">
          <p>
            {RESPONSABLE} es responsable del tratamiento de los datos personales que se capturan en este sistema
            interno (ERP). Está dirigido al personal de la empresa y a los contratistas que realizan maquila para ella.
          </p>
        </Seccion>

        <Seccion titulo="Qué datos se recaban">
          <ul className="list-disc space-y-1 pl-5">
            <li>Nombre completo y correo electrónico de tu cuenta.</li>
            <li>Tu contraseña, que se guarda cifrada (nadie, ni los administradores, puede verla).</li>
            <li>Tu rol y el área a la que perteneces; si eres contratista, el nombre del contratista y sus áreas de maquila.</li>
            <li>Una foto de perfil, solo si decides subirla.</li>
            <li>
              Lo que haces en el sistema: pedidos, avances de producción, informes de calidad, recibos de estimaciones,
              fotos de entrega y el registro de quién hizo cada cambio y cuándo.
            </li>
            <li>
              Datos técnicos de seguridad: tu dirección IP (para frenar abusos en el registro y otras acciones; se elimina
              automáticamente poco después) y, si activas la verificación en dos pasos, el factor de tu aplicación de autenticación.
            </li>
          </ul>
        </Seccion>

        <Seccion titulo="Para qué se usan">
          <p>
            Para darte acceso, controlar qué puedes ver y hacer según tu rol, operar los procesos de Planeación,
            Producción, Calidad y Estimaciones, calcular y consultar pagos de maquila, y proteger el sistema (detectar
            accesos indebidos y abusos). No se usan para publicidad ni se venden.
          </p>
        </Seccion>

        <Seccion titulo="Con quién se comparten">
          <p>Solo con los proveedores que hacen funcionar el sistema, que tratan los datos por cuenta de la empresa:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Supabase: base de datos, inicio de sesión y almacenamiento de archivos.</li>
            <li>Vercel: alojamiento de la aplicación.</li>
            <li>
              Pwned Passwords (Have I Been Pwned): al elegir una contraseña se comprueba si ya fue filtrada. Solo se envía
              un fragmento de 5 caracteres de su huella cifrada, nunca la contraseña ni tu correo.
            </li>
            <li>
              Cloudflare Turnstile: si está activado, verifica que quien se registra es una persona. Recibe tu IP y datos
              básicos del navegador.
            </li>
          </ul>
          <p>Fuera de eso, solo se comparten si una autoridad competente lo exige.</p>
        </Seccion>

        <Seccion titulo="Cookies">
          <p>
            El sistema usa únicamente las cookies necesarias para mantener tu sesión iniciada. Tus preferencias de tema y
            apariencia se guardan en el almacenamiento de tu propio navegador. No usa cookies de publicidad ni de
            analítica, por lo que no se muestra un aviso para aceptarlas.
          </p>
        </Seccion>

        <Seccion titulo="Cuánto tiempo se conservan">
          <p>
            Tus datos de cuenta se conservan mientras tengas acceso al sistema. Los registros de pedidos, calidad,
            producción y estimaciones, y su historial de cambios, se conservan mientras la empresa los necesite para sus
            obligaciones operativas, contables y legales.
          </p>
        </Seccion>

        <Seccion titulo="Tus derechos (ARCO)">
          <p>
            Puedes acceder a tus datos personales, rectificarlos, cancelarlos u oponerte a su tratamiento. Tu nombre y tu
            foto los puedes cambiar tú mismo en <strong>Mi perfil</strong>. Para lo demás, escribe
            {CORREO ? (
              <>
                {" "}a{" "}
                <a href={`mailto:${CORREO}`} className="font-medium text-brand-800 underline underline-offset-2">
                  {CORREO}
                </a>
              </>
            ) : (
              " a tu administrador del sistema"
            )}
            , indicando tu nombre y qué quieres hacer.
          </p>
        </Seccion>

        <Seccion titulo="Cambios a este aviso">
          <p>Si este aviso cambia, se actualizará esta página con la nueva fecha.</p>
        </Seccion>
      </main>
    </>
  );
}
