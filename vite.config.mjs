import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteStaticCopy } from 'vite-plugin-static-copy';

// GitHub Pages 项目站路径：https://<user>.github.io/cqu-campus-3d/
const REPO_BASE = '/cqu-campus-3d/';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? REPO_BASE : '/',
  plugins: [
    react(),
    viteStaticCopy({
      // Cesium 运行时需要的静态资源，构建时整体拷到 dist/cesium
      targets: [
        { src: 'node_modules/cesium/Build/Cesium/Workers', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/Assets', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/Widgets', dest: 'cesium' },
        { src: 'node_modules/cesium/Build/Cesium/ThirdParty', dest: 'cesium' },
      ],
    }),
  ],
  server: {
    port: 5181,
    host: '127.0.0.1',
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
}));
