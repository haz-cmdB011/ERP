// La lectura de precios anteriores falló: sin ellos el precio sugerido puede
// salir distinto al real, así que se avisa en vez de seguir como si nada.
export default function AvisoHistorico() {
  return (
    <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <strong>No se pudo cargar el histórico de precios.</strong> El precio sugerido y el aviso de
      folio repetido pueden no ser exactos. Recarga la página antes de guardar; lo que llevas
      capturado se conserva como borrador.
    </div>
  );
}
