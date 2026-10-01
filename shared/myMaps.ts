import type { BuildingCategory } from "./campus";

export type ImportedMapBuilding = {
  id: string;
  name: string;
  shortName: string;
  description: string;
  category: BuildingCategory;
  latitude: number;
  longitude: number;
};

/**
 * Building ids must match the admin schema (`^[a-z0-9-]+$`), so Thai names can't
 * be used as-is. Latin names are slugged; anything else gets a stable hash of
 * the name, so re-importing the same file updates the same rows.
 */
function slugify(value: string, index: number) {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 48);
  if (slug.length >= 3 && !/[^\x00-\x7f]/.test(value)) return slug;
  let hash = 5381;
  for (const char of value.trim()) hash = ((hash * 33) ^ char.codePointAt(0)!) >>> 0;
  return value.trim() ? `mymaps-${hash.toString(36)}` : `mymaps-building-${index + 1}`;
}

function normalizeName(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function parseCoordinate(value: string) {
  const [longitude, latitude] = value.trim().split(",").map(Number);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

export function parseMyMapsCsv(csv: string): ImportedMapBuilding[] {
  const rows = csv.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (rows.length < 2) return [];
  const split = (line: string) => line.match(/("(?:[^"]|"")*"|[^,]+)(?=,|$)/g)?.map((value) => value.replace(/^"|"$/g, "").replace(/""/g, '"').trim()) ?? [];
  const headers = split(rows[0]).map((header) => header.toLowerCase());
  const find = (cells: string[], names: string[]) => cells[headers.findIndex((header) => names.some((name) => header.includes(name)))] ?? "";
  return rows.slice(1).map((row, index) => {
    const cells = split(row);
    const coordinate = parseCoordinate(find(cells, ["coordinates", "พิกัด", "location"]));
    const latitude = Number(find(cells, ["latitude", "lat", "ละติจูด"]));
    const longitude = Number(find(cells, ["longitude", "lng", "ลองจิจูด"]));
    const position = coordinate ?? (Number.isFinite(latitude) && Number.isFinite(longitude) ? { latitude, longitude } : null);
    const name = normalizeName(find(cells, ["name", "ชื่อ", "title"])) || `อาคารจาก My Maps ${index + 1}`;
    return { id: slugify(name, index), name, shortName: name.slice(0, 120), description: find(cells, ["description", "คำอธิบาย", "รายละเอียด"]) || "นำเข้าจาก Google My Maps รอข้อมูลเพิ่มเติมจากแบ็กเอนด์", category: "บริหาร-สนับสนุน" as const, latitude: position?.latitude ?? 0, longitude: position?.longitude ?? 0 };
  }).filter((item) => item.latitude !== 0 && item.longitude !== 0);
}

export function parseMyMapsKml(kml: string): ImportedMapBuilding[] {
  if (typeof DOMParser === "undefined") return [];
  const xml = new DOMParser().parseFromString(kml, "text/xml");
  return Array.from(xml.getElementsByTagName("Placemark")).map((placemark, index) => {
    const name = normalizeName(placemark.getElementsByTagName("name")[0]?.textContent ?? "") || `อาคารจาก My Maps ${index + 1}`;
    const description = normalizeName(placemark.getElementsByTagName("description")[0]?.textContent ?? "");
    const coordinates = placemark.getElementsByTagName("coordinates")[0]?.textContent ?? "";
    const position = parseCoordinate(coordinates.split(/\s+/)[0]);
    return { id: slugify(name, index), name, shortName: name.slice(0, 120), description: description || "นำเข้าจาก Google My Maps รอข้อมูลเพิ่มเติมจากแบ็กเอนด์", category: "บริหาร-สนับสนุน" as const, latitude: position?.latitude ?? 0, longitude: position?.longitude ?? 0 };
  }).filter((item) => item.latitude !== 0 && item.longitude !== 0);
}
