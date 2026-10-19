// Static SPA build for the Capacitor Android shell: no Nitro server, every path serves the shell.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  nitro: false,
  tanstackStart: {
    server: { entry: "server" },
    spa: { enabled: true },
  },
});
