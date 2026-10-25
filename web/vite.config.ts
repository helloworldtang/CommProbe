import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      // 开发模式：WS 代理到内核（生产模式同源直连）
      "/ws": { target: "ws://localhost:7717", ws: true },
    },
  },
});
