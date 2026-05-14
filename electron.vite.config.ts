import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const aliases = {
  "@domain": resolve(__dirname, "src/domain"),
  "@domain/": resolve(__dirname, "src/domain") + "/",
  "@http": resolve(__dirname, "src/http"),
  "@http/": resolve(__dirname, "src/http") + "/",
  "@io": resolve(__dirname, "src/io"),
  "@io/": resolve(__dirname, "src/io") + "/",
  "@ipc": resolve(__dirname, "src/ipc"),
  "@ipc/": resolve(__dirname, "src/ipc") + "/",
  "@platform": resolve(__dirname, "src/platform"),
  "@platform/": resolve(__dirname, "src/platform") + "/",
  "@runtime": resolve(__dirname, "src/runtime"),
  "@runtime/": resolve(__dirname, "src/runtime") + "/",
  "@services": resolve(__dirname, "src/services"),
  "@services/": resolve(__dirname, "src/services") + "/",
  "@shared": resolve(__dirname, "src/shared"),
  "@shared/": resolve(__dirname, "src/shared") + "/",
  "@storage": resolve(__dirname, "src/storage"),
  "@storage/": resolve(__dirname, "src/storage") + "/"
};

export default defineConfig({
  main: {
    resolve: {
      alias: aliases
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main.app.ts")
        }
      }
    }
  },
  preload: {
    resolve: {
      alias: aliases
    },
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload.app.ts")
        }
      }
    }
  },
  renderer: {
    resolve: {
      alias: {
        ...aliases,
        "@renderer": resolve(__dirname, "src/renderer/src"),
        "@renderer/": resolve(__dirname, "src/renderer/src") + "/"
      }
    },
    plugins: [react()]
  }
});
