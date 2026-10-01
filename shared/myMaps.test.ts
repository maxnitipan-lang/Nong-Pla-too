import { describe, expect, it } from "vitest";
import { parseMyMapsCsv } from "./myMaps";

describe("My Maps import parser", () => {
  it("parses CSV with latitude, longitude, and names", () => {
    const result = parseMyMapsCsv("Name,Description,Latitude,Longitude\nอาคารกิจกรรม,พื้นที่กิจกรรม,13.42010302420082,100.00932106416133");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "อาคารกิจกรรม", latitude: 13.42010302420082, longitude: 100.00932106416133 });
  });
});
