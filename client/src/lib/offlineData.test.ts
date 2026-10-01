import { describe, expect, it } from "vitest";
import { offlineData } from "./offlineData";

describe("offlineData", () => {
  it("fails safely when localStorage is unavailable", () => {
    expect(offlineData.getBuildings()).toBeUndefined();
    expect(offlineData.getNews()).toBeUndefined();
    expect(() => offlineData.saveBuildings([])).not.toThrow();
    expect(() => offlineData.saveNews([])).not.toThrow();
  });
});
