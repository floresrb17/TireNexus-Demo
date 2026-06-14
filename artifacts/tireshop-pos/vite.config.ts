import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "node:fs";

const rawPort = process.env.PORT ?? "23865";

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH ?? "/";

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

const rootPackageJson = JSON.parse(
  fs.readFileSync(path.resolve(import.meta.dirname, "..", "..", "package.json"), "utf8"),
);

export default defineConfig({
  base: basePath,
  define: {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(rootPackageJson.version),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(process.env.VITE_SUPABASE_URL || ""),
    "import.meta.env.VITE_SUPABASE_ANON_KEY": JSON.stringify(process.env.VITE_SUPABASE_ANON_KEY || ""),
    "import.meta.env.VITE_SUPABASE_PRODUCTS_TABLE": JSON.stringify(process.env.VITE_SUPABASE_PRODUCTS_TABLE || "wgi_price_products"),
    "import.meta.env.VITE_PRICE_CHECKER_CLOUD_ONLY": JSON.stringify(process.env.VITE_PRICE_CHECKER_CLOUD_ONLY || "0"),
    "import.meta.env.VITE_DEMO_MODE": JSON.stringify(process.env.VITE_DEMO_MODE || "1"),
  },
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/xlsx")) return "xlsx";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react/")) return "react-vendor";
          if (id.includes("node_modules/@tanstack/react-query")) return "query";
        },
      },
    },
  },
  server: {
    port,
    strictPort: true,
    host: process.env.VITE_DEMO_MODE === "0" ? "0.0.0.0" : "127.0.0.1",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
