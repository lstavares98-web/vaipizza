import { defineConfig, mergeConfig } from "vite";
import baseConfig from "./vite.config";

const target = process.env.QA_COURIER_PROXY_TARGET?.trim();
if (!target) throw new Error("QA_COURIER_PROXY_TARGET is required for courier QA proxy config");

const proxy = {
  "/api": {
    target,
    changeOrigin: true,
    secure: true,
  },
  "/socket.io": {
    target,
    changeOrigin: true,
    secure: true,
    ws: true,
  },
};

export default mergeConfig(
  baseConfig,
  defineConfig({
    server: { proxy },
    preview: { proxy },
  }),
);
