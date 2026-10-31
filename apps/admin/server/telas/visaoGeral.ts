import { registrar } from '../auditoria.js';
import type { Admin } from '../autenticar.js';
import { consultar } from '../db.js';
import { ipDe, json } from '../http.js';
import { FUSO } from '../listagem.js';

/**
 * Visao geral: numeros da operacao, evolucao dos ultimos 6 meses, rankings e
 * atividade recente.
 *
 * "Plano" segue a regra de apps/api/src/lib/plano.ts: assinante quem tem
 * premium_until no futuro; em teste quem tem trial_ends_at no futuro.
 */
export async function visaoGeral(request: Request, admin: Admin): Promise<Response> {
  const [numeros, meses, medicamentos, especialidades, atividade] = await Promise.all([
    consultar<{
      contas: number;
      contas_ativas_30d: number;
      assinantes: number;
      em_teste: number;
      medicamentos_ativos: number;
      profissionais: number;
      perfis: number;
    }>(
      `select
         (select count(*)::int from users where is_active) as contas,
         (select count(distinct user_id)::int from sessions
           where last_used_at > now() - interval '30 days') as contas_ativas_30d,
         (select count(*)::int from users where is_active and premium_until > now()) as assinantes,
         (select count(*)::int from users
           where is_active and (premium_until is null or premium_until <= now())
             and trial_ends_at > now()) as em_teste,
         (select count(*)::int from medications where is_active) as medicamentos_ativos,
         (select count(*)::int from professionals) as profissionais,
         (select count(*)::int from profiles where is_active) as perfis`,
    ),

    // Conta "com acesso no mes" = alguma sessao aberta antes do fim do mes e
    // usada depois do inicio dele. sessions so guarda criacao e ultimo uso,
    // entao e o melhor retrato possivel sem um log de acessos.
    consultar<{ mes: string; ativas: number; novas: number }>(
      `with meses as (
         select generate_series(
           date_trunc('month', now() at time zone $1) - interval '5 months',
           date_trunc('month', now() at time zone $1),
           interval '1 month') as inicio
       )
       select to_char(m.inicio, 'YYYY-MM') as mes,
         (select count(distinct s.user_id)::int from sessions s
           where (s.created_at at time zone $1) < m.inicio + interval '1 month'
             and (s.last_used_at at time zone $1) >= m.inicio) as ativas,
         (select count(*)::int from users u
           where (u.created_at at time zone $1) >= m.inicio
             and (u.created_at at time zone $1) < m.inicio + interval '1 month') as novas
       from meses m
       order by m.inicio`,
      [FUSO],
    ),

    consultar<{ nome: string; cadastros: number; pessoas: number }>(
      `select min(trim(name)) as nome, count(*)::int as cadastros, count(distinct profile_id)::int as pessoas
         from medications
        group by lower(trim(name))
        order by cadastros desc, nome
        limit 5`,
    ),

    consultar<{ nome: string; profissionais: number }>(
      `select coalesce(nullif(min(trim(specialty)), ''), 'Sem especialidade') as nome,
              count(*)::int as profissionais
         from professionals
        group by lower(trim(coalesce(specialty, '')))
        order by profissionais desc, nome
        limit 5`,
    ),

    consultar<{ tipo: string; quando: string; quem: string; detalhe: string | null }>(
      `select * from (
         (select 'cadastro' as tipo, u.created_at as quando, coalesce(u.full_name, u.email::text) as quem,
                 null::text as detalhe
            from users u order by u.created_at desc limit 8)
         union all
         (select 'leitura', r.created_at, coalesce(u.full_name, u.email::text), r.kind || ':' || r.outcome
            from medication_photo_reads r join users u on u.id = r.user_id
           order by r.created_at desc limit 8)
         union all
         (select 'medicamento', m.created_at, coalesce(u.full_name, u.email::text), m.name
            from medications m join profiles p on p.id = m.profile_id join users u on u.id = p.user_id
           order by m.created_at desc limit 8)
         union all
         (select 'consulta', a.created_at, coalesce(u.full_name, u.email::text),
                 coalesce(pr.specialty, a.title)
            from appointments a join profiles p on p.id = a.profile_id join users u on u.id = p.user_id
            left join professionals pr on pr.id = a.professional_id
           order by a.created_at desc limit 8)
       ) eventos
       order by quando desc
       limit 8`,
    ),
  ]);

  // A atividade recente traz nomes de contas: e leitura de dado identificado.
  await registrar({ adminId: admin.id, acao: 'ver_visao_geral', recurso: 'visao_geral', ip: ipDe(request) });

  return json(200, {
    numeros: numeros[0],
    meses,
    medicamentos,
    especialidades,
    atividade,
    atualizadoEm: new Date().toISOString(),
  });
}
