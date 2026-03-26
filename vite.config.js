import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { nodePolyfills } from "vite-plugin-node-polyfills"
import { VitePWA } from "vite-plugin-pwa"

// Security headers plugin
function securityHeadersPlugin() {
  return {
    name: "security-headers",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "SAMEORIGIN");
        res.setHeader("X-XSS-Protection", "1; mode=block");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        res.setHeader("Permissions-Policy", "camera=(self), microphone=(self), geolocation=(self), payment=()");
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        if (req.url?.includes("/api/") || req.url?.includes("/verify")) {
          res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
          res.setHeader("Pragma", "no-cache");
        }
        next();
      });
    }
  };
}

export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      protocolImports: true,
      globals: { Buffer: true, global: true, process: true },
    }),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "apple-touch-icon.png", "masked-icon.svg"],
      manifest: {
        name: "RedFlag",
        short_name: "RedFlag",
        description: "Protect your relationships — uncover digital footprints across dating apps and the web.",
        theme_color: "#d411b4",
        background_color: "#22101f",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "gstatic-fonts-cache",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    }),
    securityHeadersPlugin()
  ],
  server: { allowedHosts: true },
  optimizeDeps: { include: ["react-map-gl/mapbox", "mapbox-gl"] },
  build: {
    sourcemap: false,
    target: "esnext",
    // mapbox-gl, wagmi/viem, and face-api are inherently large vendor libraries.
    // They are split into separate chunks and only loaded when the relevant pages
    // are visited (React.lazy). Raising the limit silences false-positive warnings.
    chunkSizeWarningLimit: 2000,
    modulePreload: {
      // Only eagerly preload React core. Heavy vendor chunks (web3, mapbox, ML)
      // are deferred — they load on-demand when the route that needs them is visited.
      resolveDependencies: (_url, deps) =>
        deps.filter(dep =>
          dep.includes("vendor-react") ||
          dep.includes("vendor-framer") ||
          dep.includes("index-")
        ),
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/wagmi") || id.includes("node_modules/viem") ||
            id.includes("node_modules/@wagmi") || id.includes("node_modules/connectkit") ||
            id.includes("node_modules/@tanstack/react-query")) {
            return "vendor-web3";
          }
          if (id.includes("node_modules/mapbox-gl") || id.includes("node_modules/react-map-gl")) {
            return "vendor-mapbox";
          }
          if (id.includes("node_modules/face-api") || id.includes("node_modules/tesseract")) {
            return "vendor-ml";
          }
          if (id.includes("node_modules/framer-motion")) return "vendor-framer";
          if (id.includes("node_modules/@stripe")) return "vendor-stripe";
          if (id.includes("node_modules/@supabase")) return "vendor-supabase";
          if (id.includes("node_modules/react-dom") || id.includes("node_modules/react-router-dom") ||
            id.includes("node_modules/react/") || id.includes("node_modules/scheduler")) {
            return "vendor-react";
          }
        }
      }
    }
  }
})
