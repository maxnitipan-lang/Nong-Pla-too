import path from "path";
import { defineConfig } from "vitest/config";

const root = import.meta.dirname;

// Tests live next to the code: server/, shared/ and web/js (page logic that runs in Node too).
export default defineConfig({
  resolve: {
    // Same as the import map in web/index.html: three.js is a local file, not an npm package.
    alias: [
      { find: /^three\/addons\/(.*)$/, replacement: path.join(root, "web/vendor/three/addons/$1") },
      { find: /^three$/, replacement: path.join(root, "web/vendor/three/three.module.min.js") },
    ],
  },
  test: {
    environment: "node",
    include: ["server/**/*.test.js", "shared/**/*.test.js", "web/**/*.test.js"],
  },
});
