// Small UI kit for the admin pages: icons, toasts, dialogs and form fields.

import { esc, html, raw } from "../util.js";

export { esc, html, raw };

// Lucide icons (ISC licence) used in the admin — the same ones the React version showed.
const PATHS = {
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  building: '<rect width="16" height="20" x="4" y="2" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M16 6h.01M12 6h.01M12 10h.01M12 14h.01M16 10h.01M16 14h.01M8 10h.01M8 14h.01"/>',
  footprints: '<path d="M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z"/><path d="M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z"/>',
  news: '<path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2"/><path d="M18 14h-8M15 18h-5M10 6h8v4h-8V6Z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="M12 8v4M12 16h.01"/>',
  shieldok: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  pin: '<path d="M20 10c0 4.99-5.54 10.19-7.4 11.79a1 1 0 0 1-1.2 0C9.54 20.19 4 14.99 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/>',
  external: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  plus: '<path d="M5 12h14M12 5v14"/>',
  pencil: '<path d="M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z"/><path d="m15 5 4 4"/>',
  trash: '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  key: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5"/>',
  userplus: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
  wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72M14 7l3 3M5 6v4M19 14v4M10 2v2M7 8H3M21 16h-4M11 3H9"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  eye: '<path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/>',
  eyeoff: '<path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61M2 2l20 20M14.12 14.12a3 3 0 1 1-4.24-4.24"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  close: '<path d="M18 6 6 18M6 6l12 12"/>',
  spinner: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  undo: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7"/>',
  file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2m-7.07-14.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
  pointer: '<path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z"/>',
  eraser: '<path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21M22 21H7M5 11l9 9"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  redo: '<path d="M21 7v6h-6"/><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
};

export function icon(name, cls = "") {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ""}</svg>`;
}

/* ---------------- toast */

export function toast(message, kind = "ok") {
  let box = document.querySelector(".toasts");
  if (!box) {
    box = document.createElement("div");
    box.className = "toasts";
    box.setAttribute("role", "status");
    document.body.append(box);
  }
  const el = document.createElement("div");
  el.className = `toast ${kind === "error" ? "error" : ""}`;
  el.textContent = message;
  box.append(el);
  setTimeout(() => el.remove(), kind === "error" ? 6000 : 3500);
}
export const toastError = (error) => toast(error instanceof Error ? error.message : String(error), "error");

/* ---------------- dialogs */

/**
 * Open a dialog. `body` is HTML; `onConfirm(root)` runs when the main button is
 * pressed — return false (or throw) to keep it open. Resolves true if confirmed.
 */
export function openDialog({ title, description = "", body = "", confirmLabel = "บันทึก", cancelLabel = "ยกเลิก", danger = false, wide = false, onConfirm, onOpen }) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "dlg-backdrop";
    backdrop.innerHTML = html`<div class="dlg ${wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-label="${title}">
      <h2>${title}</h2>${description ? raw(html`<p>${description}</p>`) : ""}
      <form class="dlg-body" novalidate>${raw(body)}</form>
      <div class="dlg-foot">
        ${cancelLabel ? raw(html`<button type="button" class="btn outline" data-dlg="cancel">${cancelLabel}</button>`) : ""}
        ${confirmLabel ? raw(html`<button type="button" class="btn ${danger ? "danger" : ""}" data-dlg="ok">${confirmLabel}</button>`) : ""}
      </div></div>`;
    document.body.append(backdrop);
    const root = backdrop.querySelector(".dlg");
    const ok = backdrop.querySelector("[data-dlg=ok]");
    const close = (result) => {
      backdrop.remove();
      document.removeEventListener("keydown", onKey);
      resolve(result);
    };
    const onKey = (e) => e.key === "Escape" && close(false);
    document.addEventListener("keydown", onKey);
    backdrop.addEventListener("click", async (e) => {
      if (e.target === backdrop || e.target.closest("[data-dlg=cancel]")) close(false);
      if (e.target.closest("[data-dlg=ok]")) {
        if (!onConfirm) return close(true);
        ok.disabled = true;
        const label = ok.textContent;
        ok.textContent = "กำลังบันทึก…";
        try {
          if ((await onConfirm(root)) !== false) close(true);
        } catch (error) {
          toastError(error);
        } finally {
          ok.disabled = false;
          ok.textContent = label;
        }
      }
    });
    backdrop.querySelector("form").addEventListener("submit", (e) => {
      e.preventDefault();
      ok?.click();
    });
    onOpen?.(root);
    root.querySelector("input:not([disabled]), textarea, select")?.focus();
  });
}

export const confirmDialog = (title, description, confirmLabel = "ลบ") => openDialog({ title, description, confirmLabel, danger: true });

/* ---------------- form fields (values are read back by name with readForm) */

export function field({ label, name, value = "", hint, type = "text", placeholder = "", disabled = false, rows, options, attrs = "" }) {
  let control;
  if (rows) control = html`<textarea name="${name}" rows="${rows}" placeholder="${placeholder}" ${disabled ? "disabled" : ""}>${value}</textarea>`;
  else if (options)
    control = html`<select name="${name}" ${disabled ? "disabled" : ""}>${options.map((o) => {
      const [v, text] = Array.isArray(o) ? o : [o, o];
      return raw(html`<option value="${v}" ${String(v) === String(value) ? "selected" : ""}>${text}</option>`);
    })}</select>`;
  else if (type === "color")
    control = html`<div class="color-row"><input type="color" value="${/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#123b52"}" data-color-for="${name}" aria-label="${label}" ${disabled ? "disabled" : ""} />
      <input name="${name}" value="${value}" ${disabled ? "disabled" : ""} /></div>`;
  else if (type === "checkbox")
    control = html`<label class="switch"><input type="checkbox" name="${name}" ${value ? "checked" : ""} ${disabled ? "disabled" : ""} /> ${placeholder}</label>`;
  else control = `<input type="${esc(type)}" name="${esc(name)}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${disabled ? "disabled" : ""} ${attrs} />`;
  return html`<label class="field"><span>${label}</span>${raw(control)}${hint ? raw(html`<small>${hint}</small>`) : ""}</label>`;
}

/** Keep colour pickers and their text boxes in step (call once on a container). */
export function linkColorFields(root) {
  root.addEventListener("input", (e) => {
    const picker = e.target.closest("[data-color-for]");
    if (picker) root.querySelector(`[name="${picker.dataset.colorFor}"]`).value = picker.value;
  });
}

/** Read named inputs: numbers come back as numbers (NaN when empty), checkboxes as booleans. */
export function readForm(root, names) {
  const out = {};
  for (const name of names) {
    const el = root.querySelector(`[name="${name}"]`);
    if (!el) continue;
    if (el.type === "checkbox") out[name] = el.checked;
    else if (el.type === "number") out[name] = el.value === "" ? NaN : Number(el.value);
    else out[name] = el.value;
  }
  return out;
}

/** Check input with a zod schema; shows the first problem and returns null when invalid. */
export function validate(schema, value) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    toast(parsed.error.issues[0]?.message ?? "ข้อมูลไม่ถูกต้อง", "error");
    return null;
  }
  return parsed.data;
}
