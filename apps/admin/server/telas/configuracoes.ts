import { z } from 'zod';

import { registrar } from '../auditoria.js';
import type { Admin } from '../autenticar.js';
import { consultar } from '../db.js';
import { ERRO, falha, ipDe, json, lerCookie, lerJson } from '../http.js';
import { paginar, parametrosDe } from '../listagem.js';
import { gerarHashDeSenha, verificarSenha } from '../senha.js';
import { COOKIE_DE_SESSAO, encerrarOutrasSessoes, listarSessoes } from '../sessao.js';

/**
 * Configuracoes: perfil do admin, seguranca (senha, sessoes, registro de
 * acesso) e o estado dos avisos de WhatsApp.
 *
 * As rotas de sessao e senha ficam em auth/* porque precisam do cookie da
 * sessao atual, e o navegador so manda esse cookie para /api/auth.
 */

// --- perfil ---------------------------------------------------------------

export async function conta(_request: Request, admin: Admin): Promise<Response> {
  const [linha] = await consultar<{ ultimo_login: string | null; criado: string; senha_alterada: string }>(
    `select last_login_at as ultimo_login, created_at as criado, updated_at as senha_alterada
       from painel.admin_users where id = $1`,
    [admin.id],
  );
  return json(200, { admin, ...linha });
}

const perfilSchema = z.object({ nome: z.string().trim().min(2).max(120) });

export async function editarConta(request: Request, admin: Admin): Promise<Response> {
  const dados = perfilSchema.safeParse(await lerJson(request));
  if (!dados.success) return falha(400, ERRO.DADOS_INVALIDOS);
  if (dados.data.nome === admin.nome) return json(200, { admin });
  await consultar('update painel.admin_users set full_name = $2 where id = $1', [admin.id, dados.data.nome]);
  await registrar({
    adminId: admin.id,
    acao: 'editar_perfil',
    recurso: 'conta',
    ip: ipDe(request),
    detalhes: { de: admin.nome, para: dados.data.nome },
  });
  return json(200, { admin: { ...admin, nome: dados.data.nome } });
}

// --- senha e sessoes --------------------------------------------------------

const senhaSchema = z.object({
  senhaAtual: z.string().min(1).max(200),
  novaSenha: z.string().min(12).max(200),
});

const MAXIMO_DE_FALHAS = 5;

export async function trocarSenha(request: Request, admin: Admin): Promise<Response> {
  const dados = senhaSchema.safeParse(await lerJson(request));
  if (!dados.success) return falha(400, ERRO.DADOS_INVALIDOS);
  const { senhaAtual, novaSenha } = dados.data;
  const ip = ipDe(request);

  // Mesmo limite do login: quem pegou uma sessao aberta nao fica chutando a senha.
  const [falhas] = await consultar<{ total: number }>(
    `select count(*)::int as total from painel.admin_audit_log
      where admin_id = $1 and action = 'troca_senha_falhou' and created_at > now() - interval '15 minutes'`,
    [admin.id],
  );
  if ((falhas?.total ?? 0) >= MAXIMO_DE_FALHAS) return falha(429, ERRO.MUITAS_TENTATIVAS);

  const [atual] = await consultar<{ password_hash: string }>(
    'select password_hash from painel.admin_users where id = $1',
    [admin.id],
  );
  if (!atual || !(await verificarSenha(senhaAtual, atual.password_hash))) {
    await registrar({ adminId: admin.id, acao: 'troca_senha_falhou', recurso: 'conta', ip });
    return falha(401, ERRO.CREDENCIAIS_INVALIDAS);
  }
  if (senhaAtual === novaSenha) return falha(400, ERRO.DADOS_INVALIDOS);

  await consultar('update painel.admin_users set password_hash = $2, updated_at = now() where id = $1', [
    admin.id,
    await gerarHashDeSenha(novaSenha),
  ]);
  // Senha nova derruba quem estava usando a antiga em outro navegador.
  const encerradas = await encerrarOutrasSessoes(admin.id, lerCookie(request, COOKIE_DE_SESSAO));
  await registrar({ adminId: admin.id, acao: 'trocar_senha', recurso: 'conta', ip, detalhes: { encerradas } });
  return json(200, { encerradas });
}

export async function sessoes(request: Request, admin: Admin): Promise<Response> {
  return json(200, { sessoes: await listarSessoes(admin.id, lerCookie(request, COOKIE_DE_SESSAO)) });
}

export async function encerrarOutras(request: Request, admin: Admin): Promise<Response> {
  const encerradas = await encerrarOutrasSessoes(admin.id, lerCookie(request, COOKIE_DE_SESSAO));
  await registrar({
    adminId: admin.id,
    acao: 'encerrar_sessoes',
    recurso: 'sessao',
    ip: ipDe(request),
    detalhes: { encerradas },
  });
  return json(200, { encerradas });
}

// --- registro de acesso -----------------------------------------------------

export const ACOES = [
  'login',
  'login_falhou',
  'logout',
  'ver_visao_geral',
  'listar_usuarios',
  'listar_assinaturas',
  'listar_medicamentos',
  'listar_medicos',
  'ver_relatorios',
  'editar_perfil',
  'trocar_senha',
  'troca_senha_falhou',
  'encerrar_sessoes',
] as const;

export async function auditoria(request: Request): Promise<Response> {
  const p = parametrosDe(request);
  const acao = p.filtro('acao', ACOES);

  const linhas = await consultar<{
    id: string;
    quando: string;
    admin: string;
    acao: string;
    recurso: string;
    detalhes: Record<string, unknown> | null;
    ip: string | null;
    total: number;
  }>(
    `select l.id::text as id, l.created_at as quando, a.full_name as admin, l.action as acao,
            l.resource as recurso, l.details as detalhes, host(l.ip) as ip,
            count(*) over ()::int as total
       from painel.admin_audit_log l
       join painel.admin_users a on a.id = l.admin_id
      where ($1::text is null or l.action = $1)
      order by l.created_at desc, l.id desc
      limit 10 offset $2`,
    [acao, p.offset],
  );
  return json(200, paginar(linhas, p.pagina));
}

// --- WhatsApp ---------------------------------------------------------------

/**
 * Estado dos avisos por WhatsApp, lido do rastro de envios do app
 * (whatsapp_sends). O painel nao ve as credenciais do provedor: elas ficam
 * no projeto da API do app.
 */
export async function whatsapp(): Promise<Response> {
  const [numeros, porTipo, falhas] = await Promise.all([
    consultar<{
      acompanhantes: number;
      tentativas_30d: number;
      enviadas_30d: number;
      falhas_30d: number;
      ultima_enviada: string | null;
      ultima_situacao: string | null;
      ultima_tentativa: string | null;
    }>(
      `select
         (select count(*)::int from caregivers where active) as acompanhantes,
         count(*) filter (where sent_at > now() - interval '30 days')::int as tentativas_30d,
         count(*) filter (where sent_at > now() - interval '30 days' and status = 'enviada')::int as enviadas_30d,
         count(*) filter (where sent_at > now() - interval '30 days' and status = 'falha')::int as falhas_30d,
         max(sent_at) filter (where status = 'enviada') as ultima_enviada,
         (select status from whatsapp_sends where status <> 'enviando' order by sent_at desc limit 1) as ultima_situacao,
         max(sent_at) as ultima_tentativa
       from whatsapp_sends`,
    ),
    consultar<{ tipo: string; enviadas: number }>(
      `select kind as tipo, count(*)::int as enviadas
         from whatsapp_sends
        where status = 'enviada' and sent_at > now() - interval '30 days'
        group by kind
        order by enviadas desc`,
    ),
    // O erro guardado e so um codigo (nao-configurado, http-401, tempo, rede):
    // o app nunca grava o texto da mensagem.
    consultar<{ id: string; tipo: string; quando: string; motivo: string | null }>(
      `select id, kind as tipo, sent_at as quando, error as motivo
         from whatsapp_sends
        where status = 'falha'
        order by sent_at desc
        limit 5`,
    ),
  ]);
  return json(200, { numeros: numeros[0], porTipo, falhas });
}
