import type { IncomingMessage } from 'node:http';

import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Roda a API do painel dentro do servidor do Vite em desenvolvimento.
 *
 * Em producao quem atende /api e a funcao da Vercel (api/rotas.ts). Aqui o
 * mesmo `rotear` recebe um Request montado a partir da requisicao do Node, entao
 * `npm run dev` sobe site e API juntos, sem a CLI da Vercel.
 */
function apiLocal(): Plugin {
  return {
    name: 'painel-api-local',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        try {
          const { rotear } = (await server.ssrLoadModule('/server/rotas.ts')) as typeof import('./server/rotas');
          const headers = new Headers();
          for (const [nome, valor] of Object.entries(req.headers)) {
            if (typeof valor === 'string') headers.set(nome, valor);
            else if (Array.isArray(valor)) headers.set(nome, valor.join(', '));
          }
          const temCorpo = req.method !== 'GET' && req.method !== 'HEAD';
          const request = new Request(`http://${req.headers.host}${req.originalUrl ?? req.url}`, {
            method: req.method,
            headers,
            body: temCorpo ? new Uint8Array(await lerCorpo(req)) : undefined,
          });

          const resposta = await rotear(request);
          res.statusCode = resposta.status;
          resposta.headers.forEach((valor, nome) => {
            if (nome !== 'set-cookie') res.setHeader(nome, valor);
          });
          const cookies = resposta.headers.getSetCookie();
          if (cookies.length) res.setHeader('set-cookie', cookies);
          res.end(Buffer.from(await resposta.arrayBuffer()));
        } catch (erro) {
          server.config.logger.error(String(erro));
          res.statusCode = 500;
          res.end();
        }
      });
    },
  };
}

function lerCorpo(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const partes: Buffer[] = [];
    req.on('data', (parte: Buffer) => partes.push(parte));
    req.on('end', () => resolve(Buffer.concat(partes)));
    req.on('error', reject);
  });
}

export default defineConfig(({ mode }) => {
  // A API local le DATABASE_URL e ADMIN_JWT_SECRET de .env.local. Nada disso
  // vai para o navegador: so variaveis VITE_* sao expostas ao bundle.
  const env = loadEnv(mode, process.cwd(), '');
  for (const [chave, valor] of Object.entries(env)) process.env[chave] ??= valor;

  return {
    plugins: [react(), apiLocal()],
    server: { port: 5180 },
  };
});
