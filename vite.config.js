import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  plugins: [reactRouter()],
  resolve: {
    alias: {
      "~": path.resolve("app"),
    },
  },
  css: {
    modules: {
      localsConvention: "camelCase",
    },
  },
  server: {
    port: 3000,
    strictPort: true,
    // Allow ngrok tunnels so they can reach Vite's dev server.
    // `.ngrok-free.dev` covers all free-tier rotating subdomains.
    allowedHosts: [
      'localhost',
      '127.0.0.1',
      '.ngrok-free.dev',
      '.ngrok.io',
      '.ngrok.app',
    ],
  },
});