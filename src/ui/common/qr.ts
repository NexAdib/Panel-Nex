import { encode } from 'uqr';

/** Builds an SVG path for a QR code; rendered with theme colors by the QrCode component. */
export function qrPath(text: string): { size: number; d: string } {
  const { data, size } = encode(text, { ecc: 'M', border: 2 });
  let d = '';
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y]?.[x]) d += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { size, d };
}
