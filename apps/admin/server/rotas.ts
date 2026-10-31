import { z } from 'zod';

import { registrar } from './auditoria';
import { buscarAdminAtivo, exigirAdmin, type Admin } from './autenticar';
import { consultar } from './db';
import { ERRO, falha, ipDe, json, lerCookie, lerJson } from './http';
import { gastarTempoDeVerificacao, verificarSenha } from './senha';
import {
  COOKIE_DE_SESSAO,
  cookieApagado,
  cookieDaSessao,
  criarSessao,
  encerrarSessao,
  renovarSessao,
} from './sessao';
import { assinaturas } from './telas/assinaturas';
import { auditoria, conta, editarConta, encerrarOutras, sessoes, trocarSenha, whatsapp } from './telas/configuracoes';
import { medicamentos } from './telas/medicamentos';
import { medicos } from './telas/medicos';
import { relatorios } from './telas/relatorios';
import { usuarios } from './telas/usuarios';
import { visaoGeral } from './telas/visaoGeral';
import { DURACAO_DO_ACESSO_S, emitirTokenDeAcesso } from './token';

type Handler = (request: Request) => Promise<Response>;

/** Envolve um handler de tela: so roda com admin autenticado. */
function comAdmin(handler: (request: Request, admin: Admin) => Promise<Response>): Handler {
  return async (request) => {
    const admin = await exigirAdmin(request);
    return admin instanceof Response ? admin : handler(request, admin);
  };
}

/**
 * Tabela de rotas do painel: "METODO caminho" -> handler.
 *
 * Em producao o caminho chega em ?caminho= (rewrite do vercel.json); no dev
 * do Vite, direto na URL. `caminhoDe` aceita os dois.
 */
const ROTAS: Record<string, Handler> = {
  'POST auth/login': entrar,
  'POST auth/renovar': renovar,
  'POST auth/sair': sair,
  'GET eu': eu,
  'GET visao-geral': comAdmin(visaoGeral),
  'GET usuarios': comAdmin(usuarios),
  'GET assinaturas': comAdmin(assinaturas),
  'GET medicamentos': comAdmin(medicamentos),
  'GET medicos': comAdmin(medicos),
  'GET relatorios': comAdmin(relatorios),
  'GET conta': comAdmin(conta),
  'PATCH conta': comAdmin(editarConta),
  'GET auditoria': comAdmin(auditoria),
  'GET whatsapp': comAdmin(whatsapp),
  // Em auth/* porque precisam do cookie da sessao atual.
  'GET auth/sessoes': comAdmin(sessoes),
  'POST auth/encerrar-outras': comAdmin(encerrarOutras),
  'POST auth/senha': comAdmin(trocarSenha),
};

export async function rotear(request: Request): Promise<Response> {
  const caminho = caminhoDe(request);
  const handler = ROTAS[`${request.method} ${caminho}`];
  if (!handler) {
    const existe = Object.keys(ROTAS).some((rota) => rota.endsWith(` ${caminho}`));
    return falha(existe ? 405 : 404, existe ? ERRO.METODO_NAO_PERMITIDO : ERRO.NAO_ENCONTRADO);
  }
  try {
    return await handler(request);
  } catch (erro) {
    console.error(`[painel] ${request.method} ${caminho}`, erro);
    return falha(500, ERRO.ERRO_INTERNO);
  }
}

function caminhoDe(request: Request): string {
  const url = new URL(request.url);
  const doRewrite = url.searchParams.get('caminho');
  const caminho = doRewrite ?? url.pathname.replace(/^\/api\/?/, '');
  return caminho.replace(/^\/+|\/+$/g, '');
}

// --- sessao ---------------------------------------------------------------

const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  senha: z.string().min(1).max(200),
  lembrar: z.boolean().optional().default(false),
});

const MAXIMO_DE_FALHAS = 5;
const JANELA_DE_FALHAS = '15 minutes';

async function entrar(request: Request): Promise<Response> {
  const dados = loginSchema.safeParse(await lerJson(request));
  if (!dados.success) return falha(400, ERRO.DADOS_INVALIDOS);
  const { email, senha, lembrar } = dados.data;
  const ip = ipDe(request);

  const [admin] = await consultar<{ id: string; password_hash: string; is_active: boolean }>(
    'select id, password_hash, is_active from painel.admin_users where email = $1',
    [email],
  );
  if (!admin) {
    await gastarTempoDeVerificacao(senha);
    return falha(401, ERRO.CREDENCIAIS_INVALIDAS);
  }

  // Limite por conta, contado no proprio registro de acesso: funciona entre
  // instancias da funcao, sem estado em memoria.
  const [falhas] = await consultar<{ total: number }>(
    `select count(*)::int as total from painel.admin_audit_log
      where admin_id = $1 and action = 'login_falhou'
        and created_at > now() - $2::interval`,
    [admin.id, JANELA_DE_FALHAS],
  );
  if ((falhas?.total ?? 0) >= MAXIMO_DE_FALHAS) {
    await gastarTempoDeVerificacao(senha);
    return falha(429, ERRO.MUITAS_TENTATIVAS);
  }

  const confere = await verificarSenha(senha, admin.password_hash);
  if (!confere || !admin.is_active) {
    await registrar({ adminId: admin.id, acao: 'login_falhou', recurso: 'sessao', ip });
    return falha(401, ERRO.CREDENCIAIS_INVALIDAS);
  }

  const sessao = await criarSessao({
    adminId: admin.id,
    lembrar,
    ip,
    userAgent: request.headers.get('user-agent'),
  });
  await consultar('update painel.admin_users set last_login_at = now() where id = $1', [admin.id]);
  await registrar({ adminId: admin.id, acao: 'login', recurso: 'sessao', ip, detalhes: { lembrar } });

  return respostaDeSessao(admin.id, cookieDaSessao(sessao));
}

async function renovar(request: Request): Promise<Response> {
  const token = lerCookie(request, COOKIE_DE_SESSAO);
  const renovada = token ? await renovarSessao(token) : null;
  if (!renovada) return falha(401, ERRO.SESSAO_EXPIRADA, { 'Set-Cookie': cookieApagado() });
  return respostaDeSessao(renovada.adminId, cookieDaSessao(renovada.sessao));
}

async function sair(request: Request): Promise<Response> {
  const token = lerCookie(request, COOKIE_DE_SESSAO);
  const adminId = token ? await encerrarSessao(token) : null;
  if (adminId) await registrar({ adminId, acao: 'logout', recurso: 'sessao', ip: ipDe(request) });
  return new Response(null, { status: 204, headers: { 'Set-Cookie': cookieApagado() } });
}

async function respostaDeSessao(adminId: string, cookie: string): Promise<Response> {
  const admin = await buscarAdminAtivo(adminId);
  if (!admin) return falha(401, ERRO.SESSAO_EXPIRADA, { 'Set-Cookie': cookieApagado() });
  return json(
    200,
    { tokenDeAcesso: emitirTokenDeAcesso(adminId), expiraEmSegundos: DURACAO_DO_ACESSO_S, admin },
    { 'Set-Cookie': cookie },
  );
}

// --- conta ----------------------------------------------------------------

async function eu(request: Request): Promise<Response> {
  const admin = await exigirAdmin(request);
  if (admin instanceof Response) return admin;
  return json(200, { admin });
}
