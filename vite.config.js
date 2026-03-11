import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import { VitePWA } from 'vite-plugin-pwa'

// Security headers plugin
function securityHeadersPlugin() {
  return {
    name: 'security-headers',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        // Prevent MIME type sniffing
        res.setHeader('X-Content-Type-Options', 'nosniff');
        // Prevent clickjacking
        res.setHeader('X-Frame-Options', 'SAMEORIGIN');
        // XSS Protection (legacy browsers)
        res.setHeader('X-XSS-Protection', '1; mode=block');
        // Strict referrer
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        // Permissions Policy
        res.setHeader('Permissions-Policy', 'camera=(self), microphone=(self), geolocation=(self), payment=()');
        // Strict Transport Security (HSTS)
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        // Prevent caching of sensitive pages
        if (req.url?.includes('/api/') || req.url?.includes('/verify')) {
          res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
          res.setHeader('Pragma', 'no-cache');
        }
        next();
      });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      protocolImports: true,
      globals: {
        Buffer: true,
        global: true,
        process: true,
      },
    }),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'RedFlag',
        short_name: 'RedFlag',
        description: 'Protect your relationships — uncover digital footprints across dating apps and the web.',
        theme_color: '#d411b4',
        icons: [
          {
            src: 'icons/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      workbox: {
        skipWaiting: true,       // activate new SW immediately on deploy
        clientsClaim: true,      // take control of all open tabs instantly
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'gstatic-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365 // <== 365 days
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          }
        ]
      }
    }),
    securityHeadersPlugin()
  ],
  server: {
    allowedHosts: true,
    proxy: {
      // FaceCheck.id face-scan API — specific paths only (avoids conflicting with Express /api/*)
      '/api/upload_pic': {
        target: 'https://facecheck.id',
        changeOrigin: true,
        secure: true,
      },
      '/api/search': {
        target: 'https://facecheck.id',
        changeOrigin: true,
        secure: true,
      },
      // Proxy all other /api/* calls to local Express backend in dev
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/pimeyes-api': {
        target: 'https://pimeyes.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/pimeyes-api/, '/api'),
      }
    }
  },
  optimizeDeps: {
    include: ['react-map-gl/mapbox', 'mapbox-gl']
  },
  build: {
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Web3 / crypto — heavy, only used on wallet pages
          if (id.includes('node_modules/wagmi') || id.includes('node_modules/viem') ||
              id.includes('node_modules/@wagmi') || id.includes('node_modules/connectkit') ||
              id.includes('node_modules/@tanstack/react-query')) {
            return 'vendor-web3';
          }
          // Mapbox — 1.7MB, only for map pages
          if (id.includes('node_modules/mapbox-gl') || id.includes('node_modules/react-map-gl')) {
            return 'vendor-mapbox';
          }
          // Face detection ML
          if (id.includes('node_modules/face-api') || id.includes('node_modules/tesseract')) {
            return 'vendor-ml';
          }
          // Framer Motion
          if (id.includes('node_modules/framer-motion')) {
            return 'vendor-framer';
          }
          // Stripe
          if (id.includes('node_modules/@stripe')) {
            return 'vendor-stripe';
          }
          // Supabase
          if (id.includes('node_modules/@supabase')) {
            return 'vendor-supabase';
          }
          // React core — kept small and fast
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom') ||
              id.includes('node_modules/react/') || id.includes('node_modules/scheduler')) {
            return 'vendor-react';
          }
        }
      }
    }
  }
})
