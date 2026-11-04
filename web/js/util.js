// Small DOM helpers used by every page.

/** Escape text for use inside HTML (element content or attribute values). */
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

/** Build an HTML string with ${…} values escaped. Use raw(html) for markup you trust. */
export function html(strings, ...values) {
  return strings.reduce((out, part, i) => {
    if (i === 0) return part;
    const v = values[i - 1];
    const text = v instanceof Raw ? v.value : Array.isArray(v) ? v.map((x) => (x instanceof Raw ? x.value : esc(x))).join("") : esc(v);
    return out + text + part;
  }, "");
}

class Raw {
  constructor(value) {
    this.value = value;
  }
}
/** Mark trusted markup (icons, already-built HTML) so html`` doesn't escape it. */
export const raw = (value) => new Raw(value ?? "");

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Read a JSON value from localStorage (undefined when missing or unreadable). */
export function readStore(key) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : undefined;
  } catch {
    return undefined;
  }
}

export function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked */
  }
}
