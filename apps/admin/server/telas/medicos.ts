import { registrar } from '../auditoria';
import type { Admin } from '../autenticar';
import { consultar } from '../db';
import { ipDe, json } from '../http';
import { paginar, parametrosDe } from '../listagem';

/**
 * Profissionais de saude cadastrados pelas familias.
 *
 * Nao sao usuarios do app (nao tem login nem "ultimo acesso", ao contrario do
 * mockup): cada familia guarda os seus. O mesmo medico em duas familias e
 * duas linhas.
 */
export async function medicos(request: Request, admin: Admin): Promise<Response> {
  const p = parametrosDe(request);
  const especialidade = p.texto('especialidade');

  const [linhas, [numeros], especialidades] = await Promise.all([
    consultar<{
      id: string;
      nome: string;
      especialidade: string;
      local: string | null;
      conta: string;
      consultas: number;
      ultima_consulta: string | null;
      proxima_consulta: string | null;
      receitas: number;
      total: number;
    }>(
      `with base as (
         select pr.id, pr.name as nome,
                coalesce(nullif(trim(pr.specialty), ''), 'Sem especialidade') as especialidade,
                coalesce(nullif(trim(pr.clinic_name), ''), nullif(trim(pr.address), '')) as local,
                coalesce(u.full_name, u.email::text) as conta,
                (select count(*)::int from appointments a
                  where a.professional_id = pr.id and a.status <> 'cancelada') as consultas,
                (select max(a.scheduled_at) from appointments a
                  where a.professional_id = pr.id and a.scheduled_at <= now() and a.status <> 'cancelada')
                  as ultima_consulta,
                (select min(a.scheduled_at) from appointments a
                  where a.professional_id = pr.id and a.scheduled_at > now() and a.status = 'agendada')
                  as proxima_consulta,
                (select count(*)::int from medications m where m.prescriber_id = pr.id) as receitas,
                pr.created_at
           from professionals pr
           join users u on u.id = pr.user_id
       )
       select id, nome, especialidade, local, conta, consultas, ultima_consulta, proxima_consulta, receitas,
              count(*) over ()::int as total
         from base
        where ($1::text is null or nome ilike $1 or especialidade ilike $1 or local ilike $1 or conta ilike $1)
          and ($2::text is null or lower(especialidade) = lower($2))
        order by nome
        limit 10 offset $3`,
      [p.padraoDeBusca, especialidade, p.offset],
    ),

    consultar<{ profissionais: number; especialidades: number; proximas_30d: number; com_receita: number }>(
      `select
         (select count(*)::int from professionals) as profissionais,
         (select count(distinct lower(trim(specialty)))::int from professionals
           where nullif(trim(specialty), '') is not null) as especialidades,
         (select count(*)::int from appointments
           where status = 'agendada' and scheduled_at > now() and scheduled_at <= now() + interval '30 days')
           as proximas_30d,
         (select count(distinct prescriber_id)::int from medications where prescriber_id is not null)
           as com_receita`,
    ),

    consultar<{ nome: string; profissionais: number }>(
      `select coalesce(nullif(min(trim(specialty)), ''), 'Sem especialidade') as nome,
              count(*)::int as profissionais
         from professionals
        group by lower(trim(coalesce(specialty, '')))
        order by profissionais desc, nome
        limit 8`,
    ),
  ]);

  await registrar({
    adminId: admin.id,
    acao: 'listar_medicos',
    recurso: 'medicos',
    ip: ipDe(request),
    detalhes: { busca: p.busca, especialidade, pagina: p.pagina },
  });

  return json(200, { numeros, especialidades, lista: paginar(linhas, p.pagina) });
}
