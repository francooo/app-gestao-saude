import { registrar } from '../auditoria';
import type { Admin } from '../autenticar';
import { consultar } from '../db';
import { ipDe, json } from '../http';
import { FUSO, paginar, parametrosDe } from '../listagem';

const PLANOS = ['assinante', 'teste', 'sem_plano'] as const;
const SITUACOES = ['ativa', 'inativa', 'desativada'] as const;

/**
 * Contas do app (uma por familia), com o titular, o plano e o ultimo acesso.
 *
 * Situacao: "ativa" = usou o app nos ultimos 30 dias; "inativa" = nao usou;
 * "desativada" = users.is_active falso (conta encerrada).
 */
export async function usuarios(request: Request, admin: Admin): Promise<Response> {
  const p = parametrosDe(request);
  const plano = p.filtro('plano', PLANOS);
  const situacao = p.filtro('situacao', SITUACOES);

  const [linhas, [numeros]] = await Promise.all([
    consultar<{
      id: string;
      nome: string;
      email: string;
      nascimento: string | null;
      plano: string;
      perfis: number;
      ultimo_acesso: string | null;
      cadastro: string;
      situacao: string;
      total: number;
    }>(
      `with base as (
         select u.id,
                coalesce(u.full_name, titular.full_name, u.email::text) as nome,
                u.email::text as email,
                titular.birth_date::text as nascimento,
                case when u.premium_until > now() then 'assinante'
                     when u.trial_ends_at > now() then 'teste'
                     else 'sem_plano' end as plano,
                (select count(*)::int from profiles pf where pf.user_id = u.id and pf.is_active) as perfis,
                (select max(s.last_used_at) from sessions s where s.user_id = u.id) as ultimo_acesso,
                u.created_at as cadastro,
                u.is_active
           from users u
           left join lateral (
             select pf.full_name, pf.birth_date from profiles pf
              where pf.user_id = u.id and pf.is_account_holder
              order by pf.created_at limit 1
           ) titular on true
       ), com_situacao as (
         select *, case when not is_active then 'desativada'
                        when ultimo_acesso > now() - interval '30 days' then 'ativa'
                        else 'inativa' end as situacao
           from base
       )
       select id, nome, email, nascimento, plano, perfis, ultimo_acesso, cadastro, situacao,
              count(*) over ()::int as total
         from com_situacao
        where ($1::text is null or nome ilike $1 or email ilike $1)
          and ($2::text is null or plano = $2)
          and ($3::text is null or situacao = $3)
        order by ultimo_acesso desc nulls last, cadastro desc
        limit 10 offset $4`,
      [p.padraoDeBusca, plano, situacao, p.offset],
    ),

    consultar<{
      contas: number;
      ativas_hoje: number;
      novas_no_mes: number;
      perfis: number;
      ativas_1d: number;
      ativas_7d: number;
      ativas_30d: number;
    }>(
      `select
         (select count(*)::int from users where is_active) as contas,
         (select count(distinct user_id)::int from sessions
           where (last_used_at at time zone $1)::date = (now() at time zone $1)::date) as ativas_hoje,
         (select count(*)::int from users
           where date_trunc('month', created_at at time zone $1) = date_trunc('month', now() at time zone $1))
           as novas_no_mes,
         (select count(*)::int from profiles where is_active) as perfis,
         (select count(distinct user_id)::int from sessions where last_used_at > now() - interval '1 day') as ativas_1d,
         (select count(distinct user_id)::int from sessions where last_used_at > now() - interval '7 days') as ativas_7d,
         (select count(distinct user_id)::int from sessions where last_used_at > now() - interval '30 days') as ativas_30d`,
      [FUSO],
    ),
  ]);

  await registrar({
    adminId: admin.id,
    acao: 'listar_usuarios',
    recurso: 'usuarios',
    ip: ipDe(request),
    detalhes: { busca: p.busca, plano, situacao, pagina: p.pagina },
  });

  return json(200, { numeros, lista: paginar(linhas, p.pagina) });
}
