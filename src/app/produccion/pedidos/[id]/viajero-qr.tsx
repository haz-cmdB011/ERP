"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Genera el QR en el cliente (canvas/data URL), no hay backend de QR.
// `value` es la URL absoluta de la Hoja de Viajero (la arma el server
// component que llama a este componente): al escanearla, el celular abre
// la página directamente en vez de solo mostrar texto suelto.
export default function ViajeroQr({ value }: { value: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    QRCode.toDataURL(value, { margin: 1, width: 120 })
      .then((url) => {
        if (!cancelado) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelado) setDataUrl(null);
      });
    return () => {
      cancelado = true;
    };
  }, [value]);

  return (
    <div className="flex h-[120px] w-[120px] items-center justify-center border border-gray-300 text-[10px] text-gray-400">
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL generado en cliente, next/image no aplica
        <img src={dataUrl} alt="Código QR del ítem" width={120} height={120} />
      ) : (
        "QR"
      )}
    </div>
  );
}
