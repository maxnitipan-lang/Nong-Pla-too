// QR codes drawn locally (no outside service) as sharp SVGs.
// Put <div class="qr" data-qr="https://…"></div> in the page, then call fillQrCodes(root).

import QRCode from "../vendor/qrcode.js";

const cache = new Map();

function svgFor(value) {
  if (!cache.has(value)) {
    cache.set(value, QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#10293a", light: "#ffffff" } }).catch(() => ""));
  }
  return cache.get(value);
}

export async function fillQrCodes(root = document) {
  const boxes = [...root.querySelectorAll("[data-qr]")].filter((el) => el.dataset.qrDone !== el.dataset.qr);
  await Promise.all(
    boxes.map(async (el) => {
      const value = el.dataset.qr;
      el.innerHTML = await svgFor(value);
      el.dataset.qrDone = value;
    }),
  );
}
