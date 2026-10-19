// Department logos and the building detail panel, used by the kiosk's places screen.
import { BUILDING_MARKER_IMAGES, departmentLogo } from "@/config/kioskAssets";
import { DEFAULT_DEPARTMENTS } from "@shared/campus";
import type { CampusBuilding, DepartmentProfile } from "@shared/campus";
import { Building2 } from "lucide-react";

/** Departments housed in a building (demo departments when it has none). */
export function departmentFor(building: CampusBuilding): DepartmentProfile[] {
  return (building.departments?.length ? building.departments : DEFAULT_DEPARTMENTS).filter(
    department => department.floor <= building.floors
  );
}

/** The department shown for a building in lists and on its pin: the first one that has a logo. */
export function mainDepartment(building: CampusBuilding): DepartmentProfile | undefined {
  const departments = departmentFor(building);
  return departments.find(d => departmentLogo(d)) ?? departments[0];
}

/** Rounded badge: the department's logo, or its code on its colour when there is no logo. */
export function DeptLogo({
  department,
  size = "md",
  image,
}: {
  department: DepartmentProfile;
  size?: "sm" | "md";
  image?: string;
}) {
  const logo = image ?? departmentLogo(department);
  return (
    <span
      className={`${size === "sm" ? "h-9 w-9 text-[10px]" : "h-12 w-12 text-xs"} relative flex shrink-0 items-center justify-center overflow-hidden rounded-2xl font-black text-white shadow-sm`}
      style={{ backgroundColor: department.accent }}
    >
      {logo && (
        <img
          src={logo}
          alt={`โลโก้${department.name}`}
          className="absolute inset-0 z-10 h-full w-full object-cover"
          onError={event => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
      <span className="relative">{department.code}</span>
    </span>
  );
}

/** Badge for a building in the list: its own photo, else its main department's logo. */
export function BuildingBadge({ building }: { building: CampusBuilding }) {
  const department = mainDepartment(building) ?? {
    id: building.id,
    floor: 1,
    name: building.name,
    code: building.shortName.slice(0, 3),
    description: "",
    skills: [],
    careers: [],
    accent: building.accent,
  };
  return <DeptLogo department={department} size="sm" image={BUILDING_MARKER_IMAGES[building.id]} />;
}

/** HTML for a building's map pin (Leaflet needs a string): logo badge + short name. */
export function buildingMarkerHtml(building: CampusBuilding, active: boolean) {
  const dept = mainDepartment(building);
  const accent = dept?.accent ?? building.accent;
  const code = dept?.code ?? building.shortName.slice(0, 3);
  const logo = BUILDING_MARKER_IMAGES[building.id] ?? (dept ? departmentLogo(dept) : undefined);
  return `<div style="display:flex;flex-direction:column;align-items:center">
    <span class="relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-[20px] border-4 border-white text-[10px] font-black text-white shadow-[0_8px_20px_rgba(16,41,58,0.28)] ${active ? "ring-4 ring-[#f6b89f]/60" : ""}" style="background-color:${accent}">
      ${logo ? `<img src="${logo}" alt="" class="absolute inset-0 z-10 h-full w-full object-cover" onerror="this.style.display='none'" />` : ""}
      <span class="relative">${code}</span>
    </span>
    <span class="pointer-events-none mt-2 whitespace-nowrap rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-[var(--ink)] shadow-sm">${building.shortName}</span>
  </div>`;
}

/** Building details: floors, rooms and the departments inside. */
export function DepartmentPanel({ building }: { building: CampusBuilding }) {
  const departments = departmentFor(building);
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span
          className="flex h-12 w-12 items-center justify-center rounded-2xl text-white"
          style={{ backgroundColor: building.accent }}
        >
          <Building2 size={22} />
        </span>
        <div>
          <p className="text-[11px] font-black tracking-[0.12em] text-[#398e89]">ข้อมูลหมุดอาคาร</p>
          <h2 className="mt-1 font-display text-2xl font-black tracking-[-0.04em] text-[var(--ink)]">
            {building.name}
          </h2>
          <p className="mt-1 text-xs font-bold text-[var(--muted-foreground)]">
            {building.category} · {building.floors} ชั้น
          </p>
        </div>
      </div>
      <p className="text-sm leading-7 text-[var(--muted-foreground)]">{building.description}</p>
      <div className="rounded-2xl bg-[#f2f8f5] p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-black text-[var(--ink)]">ข้อมูลแต่ละชั้น</p>
          <span className="text-[10px] font-bold text-[var(--muted-foreground)]">{building.floors} ชั้น</span>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {building.floorsDetail.map(floor => (
            <div key={floor.level} className="min-w-[118px] rounded-xl bg-white p-3 ring-1 ring-[#dcebe5]">
              <p className="text-[11px] font-black text-[var(--ink)]">{floor.label}</p>
              <p className="mt-2 text-[10px] leading-5 text-[var(--muted-foreground)]">
                {floor.rooms.slice(0, 2).join(" · ")}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <p className="mb-3 text-xs font-black text-[var(--ink)]">สาขาวิชาและกิจกรรมในหมุดนี้</p>
        <div className="space-y-3">
          {departments.map(department => (
            <div key={department.id} className="rounded-2xl border border-[var(--border)] bg-white p-3">
              <div className="flex items-center gap-3">
                <DeptLogo department={department} size="sm" />
                <div>
                  <p className="text-sm font-black text-[var(--ink)]">{department.name}</p>
                  <p className="mt-1 text-[10px] font-bold text-[var(--muted-foreground)]">
                    ชั้น {department.floor} · {department.code}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(department.activities ?? ["กิจกรรมแนะนำสาขา", "ฝึกปฏิบัติจากสถานการณ์จริง"]).map(activity => (
                  <span
                    key={activity}
                    className="rounded-full bg-[#fff3ed] px-2.5 py-1 text-[10px] font-bold text-[#b85e46]"
                  >
                    {activity}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
