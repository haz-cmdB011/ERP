// Fondo de la app: hoja de planos de muebles (cuadrícula, piezas en vista
// frontal/lateral/planta y sus cotas) que se repite detrás de todo. Es nítido a
// propósito: lo difuminan los paneles de vidrio que van encima (vidrio.css).
// Los colores salen de variables CSS (--fondo-papel, --fondo-trazo,
// --fondo-cota), así que siguen la paleta elegida en "Personalizar apariencia"
// y el modo claro/oscuro. Las medidas de las cotas están en cm.

const ANCHO = 1200;
const ALTO = 800;

// Cota horizontal (y fija) o vertical (x fija), con remates diagonales en los
// extremos como en los planos de carpintería.
function Cota({
  x1,
  y1,
  x2,
  y2,
  texto,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  texto: string;
}) {
  const vertical = x1 === x2;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <g>
      <path className="c" d={`M${x1} ${y1} L${x2} ${y2}`} />
      <path className="c" d={`M${x1 - 4} ${y1 + 4} l8 -8 M${x2 - 4} ${y2 + 4} l8 -8`} />
      {vertical ? (
        <text className="txt" x={x1 - 7} y={my} textAnchor="middle" transform={`rotate(-90 ${x1 - 7} ${my})`}>
          {texto}
        </text>
      ) : (
        <text className="txt" x={mx} y={y1 - 7} textAnchor="middle">
          {texto}
        </text>
      )}
    </g>
  );
}

function Etiqueta({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text className="txt etiqueta" x={x} y={y}>
      {children}
    </text>
  );
}

function Silla() {
  return (
    <g transform="translate(90 110)">
      <path className="t" d="M14 0H30L38 280H22Z" />
      <path className="t" d="M30 20Q46 70 34 132" />
      <rect className="t" x="12" y="140" width="138" height="14" rx="3" />
      <path className="t" d="M16 140Q80 128 146 140" />
      <path className="t" d="M124 154H140L136 280H126Z" />
      <path className="t" d="M34 230H128" />
      <Cota x1={-24} y1={0} x2={-24} y2={280} texto="90" />
      <Cota x1={14} y1={304} x2={140} y2={304} texto="45" />
      <Etiqueta x={0} y={334}>SILLA · S-01</Etiqueta>
    </g>
  );
}

function MesaCentro() {
  return (
    <g transform="translate(470 150)">
      <path className="c eje" d="M-92 0H92M0 -92V92" />
      <circle className="t" r="72" />
      <circle className="t" r="64" />
      <circle className="t oculta" r="22" />
      <Cota x1={-72} y1={108} x2={72} y2={108} texto="ø 80" />
      <Etiqueta x={-72} y={134}>MESA CENTRO · MC-02</Etiqueta>
    </g>
  );
}

function Sofa() {
  return (
    <g transform="translate(680 90)">
      <rect className="t" x="44" y="0" width="134" height="74" rx="12" />
      <rect className="t" x="182" y="0" width="134" height="74" rx="12" />
      <rect className="t" x="0" y="40" width="44" height="100" rx="14" />
      <rect className="t" x="316" y="40" width="44" height="100" rx="14" />
      <rect className="t" x="44" y="74" width="136" height="30" rx="6" />
      <rect className="t" x="180" y="74" width="136" height="30" rx="6" />
      <path className="t" d="M44 104V140H316V104" />
      <path className="t" d="M22 140V162M338 140V162M22 162h10M328 162h10" />
      <Cota x1={-24} y1={0} x2={-24} y2={162} texto="85" />
      <Cota x1={0} y1={188} x2={360} y2={188} texto="220" />
      <Etiqueta x={0} y={218}>SOFÁ · SF-12</Etiqueta>
    </g>
  );
}

function Lampara() {
  return (
    <g transform="translate(1130 70)">
      <path className="t" d="M-36 0H36L56 64H-56Z" />
      <path className="t" d="M-28 14H28" />
      <path className="t" d="M0 64V298M0 180h7" />
      <ellipse className="t" cx="0" cy="302" rx="38" ry="7" />
      <Cota x1={-66} y1={0} x2={-66} y2={309} texto="165" />
      <Etiqueta x={-56} y={340}>LÁMPARA · L-03</Etiqueta>
    </g>
  );
}

function Mesa() {
  return (
    <g transform="translate(330 330)">
      <rect className="t" x="0" y="0" width="320" height="16" rx="2" />
      <rect className="t" x="20" y="16" width="280" height="24" />
      <path className="t" d="M26 40H44L40 190H30ZM276 40H294L290 190H280Z" />
      <path className="t oculta" d="M60 40L56 182M264 40L260 182" />
      <Cota x1={0} y1={-22} x2={320} y2={-22} texto="160" />
      <Cota x1={346} y1={0} x2={346} y2={190} texto="76" />
      <Etiqueta x={0} y={220}>MESA · M-04</Etiqueta>
    </g>
  );
}

function Sillon() {
  return (
    <g transform="translate(720 420)">
      <rect className="t" x="24" y="0" width="172" height="96" rx="16" />
      <rect className="t" x="0" y="56" width="40" height="104" rx="14" />
      <rect className="t" x="180" y="56" width="40" height="104" rx="14" />
      <rect className="t" x="40" y="96" width="140" height="34" rx="8" />
      <rect className="t" x="40" y="130" width="140" height="30" rx="4" />
      <path className="t" d="M16 160L12 188M204 160L208 188" />
      {[
        [80, 36],
        [110, 36],
        [140, 36],
        [95, 62],
        [125, 62],
      ].map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} className="p" cx={cx} cy={cy} r="2.5" />
      ))}
      <Cota x1={0} y1={212} x2={220} y2={212} texto="90" />
      <Etiqueta x={0} y={242}>SILLÓN · SL-07</Etiqueta>
    </g>
  );
}

function Banco() {
  return (
    <g transform="translate(1010 470)">
      <rect className="t" x="0" y="0" width="110" height="14" rx="7" />
      <path className="t" d="M14 14L2 200M96 14L108 200" />
      <path className="t oculta" d="M32 14L28 194M78 14L82 194" />
      <path className="t" d="M8 120H102" />
      <Cota x1={136} y1={0} x2={136} y2={200} texto="65" />
      <Etiqueta x={0} y={232}>BANCO · B-09</Etiqueta>
    </g>
  );
}

function Librero() {
  return (
    <g transform="translate(60 500)">
      <rect className="t" x="0" y="0" width="190" height="250" />
      <path className="t" d="M8 8V242H182V8ZM8 66H182M8 128H182M8 190H182" />
      {/* Libros y cajas en las repisas. */}
      <path className="t" d="M16 66V20H28V66M30 66V16H40V66M42 66V26H56V66M60 66L74 24L84 27L70 66" />
      <path className="t" d="M120 66V30H134V66M136 66V22H146V66M148 66V34H170V66" />
      <rect className="t" x="18" y="98" width="52" height="30" />
      <path className="t" d="M110 128V82H122V128M124 128V78H134V128M136 128V88H150V128" />
      <path className="t" d="M20 190V146H32V190M34 190V140H48V190M50 190V150H60V190" />
      <ellipse className="t" cx="146" cy="160" rx="18" ry="30" />
      <Cota x1={-22} y1={0} x2={-22} y2={250} texto="180" />
      <Etiqueta x={0} y={278}>LIBRERO · LB-05</Etiqueta>
    </g>
  );
}

function Comoda() {
  return (
    <g transform="translate(330 590)">
      <rect className="t" x="0" y="0" width="240" height="12" rx="2" />
      <rect className="t" x="8" y="12" width="224" height="120" />
      {[22, 58, 94].map((y) => (
        <g key={y}>
          <rect className="t" x="18" y={y} width="204" height="30" rx="2" />
          <circle className="p" cx="120" cy={y + 15} r="4" />
        </g>
      ))}
      <path className="t" d="M20 132L16 150M220 132L224 150" />
      <Cota x1={0} y1={172} x2={240} y2={172} texto="120" />
      <Etiqueta x={0} y={196}>CÓMODA · CM-03</Etiqueta>
    </g>
  );
}

// Detalle de ensamble de cola de milano.
function Ensamble() {
  return (
    <g transform="translate(880 690)">
      <rect className="t" x="0" y="0" width="100" height="60" />
      <path className="t" d="M0 30H12L8 20H28L24 40H44L40 20H60L56 40H76L72 20H92L88 30H100" />
      <circle className="c" cx="50" cy="30" r="44" strokeDasharray="3 4" />
      <Etiqueta x={0} y={100}>DETALLE A · ENSAMBLE</Etiqueta>
    </g>
  );
}

export default function FondoMobiliario() {
  return (
    <div className="fondo-mobiliario print:hidden" aria-hidden="true">
      <svg width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="fondo-cuadricula" width="24" height="24" patternUnits="userSpaceOnUse">
            <path className="cuad" d="M24 0H0V24" />
          </pattern>
          <pattern id="fondo-cuadricula-mayor" width="120" height="120" patternUnits="userSpaceOnUse">
            <path className="cuad mayor" d="M120 0H0V120" />
          </pattern>
          <pattern id="fondo-muebles" width={ANCHO} height={ALTO} patternUnits="userSpaceOnUse">
            <Silla />
            <MesaCentro />
            <Sofa />
            <Lampara />
            <Mesa />
            <Sillon />
            <Banco />
            <Librero />
            <Comoda />
            <Ensamble />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#fondo-cuadricula)" />
        <rect width="100%" height="100%" fill="url(#fondo-cuadricula-mayor)" />
        <rect width="100%" height="100%" fill="url(#fondo-muebles)" />
      </svg>
    </div>
  );
}
