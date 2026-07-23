import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// 純クライアント SPA。spec(YAML) は実行時に fetch し、ブラウザ内で $ref 解決・検証する。
// GitHub Pages 配下のサブパス配信に備え base は環境変数で切替可能にする。
export default defineConfig({
  base: process.env.VIEWER_BASE ?? "/",
  plugins: [react()],
});
