import { registrar } from '../auditoria.js';
import type { Admin } from '../autenticar.js';
import { consultar } from '../db.js';
import { ipDe, json } from '../http.js';
import { FUSO, paginar, parametrosDe } from '../listagem.js';

const SITUACOES = ['estoque_baixo', 'validade_proxima', 'estavel', 'sem_controle'] as const;

/**
 * Remedios ativos das familias, com estoque e validade.
 *
 * O ESTOQUE E A MESMA CONTA DO APP, reescrita em SQL para filtrar e paginar no
 * banco. As regras vem de:
 *   - apps/api/src/lib/estoque.ts: restante = compras - doses 'tomada' desde a
 *     primeira compra (cada dose desconta amount, senao dose_amount, senao 1);
 *     validade = a mais proxima ainda nao vencida.
 *   - apps/mobile/src/lib/estoque.ts (`estoqueBaixo`, igual ao cron do
 *     WhatsApp): acabou, ou dura ate 7 dias no ritmo da posologia, ou — sem
 *     ritmo ("se necessario") — sobrou ate 25% da ultima compra. Validade
 *     proxima = vence em ate 30 dias.
 * Se essas regras mudarem no app, mudar aqui tambem; senao o painel e o
 * celular discordam sobre o mesmo remedio.
 *
 * Remedio sem nenhuma compra = "sem controle de estoque", que nao e "acabou".
 */
const CONSULTA_BASE = `
  with compras as (
    select medication_id,
           sum(units)::numeric as comprado,
           min(purchased_at) as primeira,
           min(expires_on) filter (where expires_on >= (now() at time zone $1)::date) as validade,
           (array_agg(units order by purchased_at desc))[1] as ultima_compra
      from medication_stock_entries
     group by medication_id
  ), horarios as (
    select medication_id, count(*)::int as n from medication_times group by medication_id
  ), base as (
    select m.id, m.name as nome, m.strength as concentracao, m.form as forma,
           p.full_name as pessoa,
           coalesce(u.full_name, u.email::text) as conta,
           c.comprado, c.validade, c.ultima_compra,
           greatest(0, c.comprado - coalesce((
             select sum(coalesce(d.amount, m.dose_amount, 1)) from medication_doses d
              where d.medication_id = m.id and d.status = 'tomada' and d.taken_at >= c.primeira
           ), 0)) as restante,
           (case m.schedule_type
              when 'as_needed' then 0
              when 'interval' then coalesce(24.0 / nullif(m.interval_hours, 0), 0)
              else coalesce(h.n, 0) * case
                when coalesce(m.weekdays, 0) <> 0 then
                  (select count(*) from generate_series(0, 6) bit where (m.weekdays >> bit) & 1 = 1) / 7.0
                when m.day_interval > 1 then 1.0 / m.day_interval
                else 1 end
            end) * coalesce(m.dose_amount, 1) as unidades_por_dia,
           m.created_at
      from medications m
      join profiles p on p.id = m.profile_id
      join users u on u.id = p.user_id
      left join compras c on c.medication_id = m.id
      left join horarios h on h.medication_id = m.id
     where m.is_active
  ), com_situacao as (
    select *, case
      when comprado is null then 'sem_controle'
      when restante <= 0
        or (unidades_por_dia > 0 and restante / unidades_por_dia <= 7)
        or (unidades_por_dia = 0 and restante <= ultima_compra * 0.25) then 'estoque_baixo'
      when validade is not null and validade <= (now() at time zone $1)::date + 30 then 'validade_proxima'
      else 'estavel' end as situacao
    from base
  )`;

export async function medicamentos(request: Request, admin: Admin): Promise<Response> {
  const p = parametrosDe(request);
  const situacao = p.filtro('situacao', SITUACOES);

  const [linhas, [contagem], [leituras]] = await Promise.all([
    consultar<{
      id: string;
      nome: string;
      concentracao: string | null;
      forma: string | null;
      pessoa: string;
      conta: string;
      restante: string | null;
      validade: string | null;
      situacao: string;
      total: number;
    }>(
      `${CONSULTA_BASE}
       select id, nome, concentracao, forma, pessoa, conta, restante, validade::text, situacao,
              count(*) over ()::int as total
         from com_situacao
        where ($2::text is null or nome ilike $2 or pessoa ilike $2 or conta ilike $2)
          and ($3::text is null or situacao = $3)
        order by case situacao when 'estoque_baixo' then 0 when 'validade_proxima' then 1
                               when 'estavel' then 2 else 3 end,
                 nome
        limit 10 offset $4`,
      [FUSO, p.padraoDeBusca, situacao, p.offset],
    ),

    consultar<{ ativos: number; estoque_baixo: number; validade_proxima: number; sem_controle: number }>(
      `${CONSULTA_BASE}
       select count(*)::int as ativos,
              count(*) filter (where situacao = 'estoque_baixo')::int as estoque_baixo,
              count(*) filter (where situacao = 'validade_proxima')::int as validade_proxima,
              count(*) filter (where situacao = 'sem_controle')::int as sem_controle
         from com_situacao`,
      [FUSO],
    ),

    consultar<{ lidas: number; lidas_30d: number; tentativas: number }>(
      `select count(*) filter (where outcome = 'lida')::int as lidas,
              count(*) filter (where outcome = 'lida' and created_at > now() - interval '30 days')::int as lidas_30d,
              count(*)::int as tentativas
         from medication_photo_reads`,
    ),
  ]);

  await registrar({
    adminId: admin.id,
    acao: 'listar_medicamentos',
    recurso: 'medicamentos',
    ip: ipDe(request),
    detalhes: { busca: p.busca, situacao, pagina: p.pagina },
  });

  return json(200, { numeros: { ...contagem, ...leituras }, lista: paginar(linhas, p.pagina) });
}
