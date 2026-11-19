import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Local development shim: runs the Vercel functions in /api inside the Vite dev server,
 * so `npm run dev` behaves like production (same handlers, same JSON, same caching headers).
 */
function apiDevPlugin(): Plugin {
  return {
    name: 'unbiased-stats-api-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        if (!url.pathname.startsWith('/api/')) return next();
        const name = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
        if (!/^[a-z-]+$/.test(name)) {
          res.statusCode = 404;
          res.setHeader('content-type', 'application/json');
          return res.end(JSON.stringify({ error: 'Not found' }));
        }
        try {
          const mod = await server.ssrLoadModule(`/api/${name}.ts`);
          const shim = res as unknown as Record<string, unknown>;
          shim.status = (code: number) => {
            res.statusCode = code;
            return shim;
          };
          shim.send = (body: string) => {
            res.end(body);
            return shim;
          };
          shim.json = (body: unknown) => {
            res.setHeader('content-type', 'application/json');
            res.end(JSON.stringify(body));
            return shim;
          };
          await mod.default(
            { method: req.method, url: req.url, query: Object.fromEntries(url.searchParams.entries()) },
            shim,
          );
        } catch (err) {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('content-type', 'application/json');
          }
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Dev API error' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiDevPlugin()],
  server: { host: '0.0.0.0', port: 5173, strictPort: false, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: { globe: ['globe.gl'], react: ['react', 'react-dom'] },
      },
    },
  },
});
