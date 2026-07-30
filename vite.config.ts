import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tsConfigPaths from "vite-tsconfig-paths";

// NOTE: originally used @lovable.dev/vite-tanstack-config, a wrapper hosted
// by Lovable that isn't available outside their platform. Replaced with the
// equivalent plain TanStack Start Vite plugin so this builds and runs
// standalone.
//
// IMPORTANT: tanstackStart() already registers its own internal TanStack
// Router plugin instance for file-based routing. Do NOT also add a separate
// tanstackRouter() plugin here — Vite doesn't dedupe two plugins with the
// same name, so both would transform every route file and both would try to
// inject the same dev-mode HMR "hot" binding, causing:
//   "Duplicate declaration 'hot'" — Plugin: tanstack-router:code-splitter
// Router options (routes directory, generated route tree path, code
// splitting) are passed via tanstackStart()'s own `router` option instead.
export default defineConfig({
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
      router: {
        routesDirectory: "routes",
        generatedRouteTree: "routeTree.gen.ts",
      },
    }),
    react(),
  ],
});
