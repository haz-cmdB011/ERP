// Contenido que se pliega y se despliega con animación de altura, tanto al abrir
// como al cerrar. Siempre está montado: cerrado queda oculto y `inert` (sin foco
// ni lectura de pantalla). Pensado para listas y tablas; no usarlo si dentro hay
// menús que deben salirse del recuadro (el contenido recorta mientras anima).
export default function Colapsable({
  abierto,
  children,
  className = "",
}: {
  abierto: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`colapsable ${abierto ? "colapsable-abierto" : ""} ${className}`} inert={!abierto}>
      <div className="min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
