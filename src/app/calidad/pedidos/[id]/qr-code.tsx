"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Copia local del generador de QR que ya usa Producción (viajero-qr.tsx) —
// duplicado a propósito para no tocar ningún archivo bajo src/app/produccion/.
// Genera el QR en el cliente (canvas/data URL); `value` es la URL absoluta
// del informe, para que escanearlo abra la página directamente.
export default function QrCode({ value, size = 120 }: { value: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    QRCode.toDataURL(value, { margin: 1, width: size })
      .then((url) => {
        if (!cancelado) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelado) setDataUrl(null);
      });
    return () => {
      cancelado = true;
    };
  }, [value, size]);

  return (
    <div
      className="flex items-center justify-center border border-gray-300 text-[10px] text-gray-400"
      style={{ height: size, width: size }}
    >
      {dataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL generado en cliente, next/image no aplica
        <img src={dataUrl} alt="Código QR del informe" width={size} height={size} />
      ) : (
        "QR"
      )}
    </div>
  );
}
