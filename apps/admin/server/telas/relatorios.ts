import { registrar } from '../auditoria';
import type { Admin } from '../autenticar';
import { consultar } from '../db';
import { ipDe, json } from '../http';
import { FUSO, parametrosDe } from '../listagem';

/**
 * Relatorios: numeros do periodo escolhido comparados com o periodo anterior
 * de mesmo tamanho, e a serie do grafico.
 *
 * O periodo e uma soma de faixas de calendario no fuso do painel (dias,
 * semanas ou meses), terminando na faixa atual. Assim o total da tabela bate
 * com a soma do grafico.
 *
 * So numeros agregados, sem nome de conta.
 */
const PERIODOS = {
  '7d': { faixa: 'day', passo: '1 day', faixas: 7 },
  '30d': { faixa: 'day', passo: '1 day', faixas: 30 },
  '90d': { faixa: 'week', passo: '1 week', faixas: 13 },
  '12m': { faixa: 'month', passo: '1 month', faixas: 12 },
} as const;
type Periodo = keyof typeof PERIODOS;

const CATEGORIAS = [
  'novas_contas',
  'contas_com_acesso',
  'medicamentos',
  'doses',
  'consultas',
  'leituras',
  'mensagens',
] as const;

export async function relatorios(request: Request, admin: Admin): Promise<Response> {
  const periodo: Periodo = parametrosDe(request).filtro('periodo', Object.keys(PERIODOS) as Periodo[]) ?? '30d';
  const { faixa, passo, faixas } = PERIODOS[periodo];
  // $1 fuso, $2 unidade do date_trunc, $3 tamanho da faixa, $4 numero de faixas
  const parametros = [FUSO, faixa, passo, faixas];

  // Inicio do periodo atual e do anterior, como instantes.
  const LIMITES = `
    with limites as (
      select (date_trunc($2, now() at time zone $1) - ($4::int - 1) * $3::interval) at time zone $1 as ini,
             now() as fim
    ), l as (
      select ini, fim, ((ini at time zone $1) - $4::int * $3::interval) at time zone $1 as ini_ant from limites
    )`;

  const [serie, totais, atuais] = await Promise.all([
    // "Com acesso na faixa" usa a mesma regra da Visao geral: sessao aberta
    // antes do fim da faixa e usada depois do inicio dela.
    consultar<{ inicio: string; ativas: number; novas: number }>(
      `with faixas as (
         select gs as local,
                gs at time zone $1 as ini,
                (gs + $3::interval) at time zone $1 as fim
           from generate_series(
                  date_trunc($2, now() at time zone $1) - ($4::int - 1) * $3::interval,
                  date_trunc($2, now() at time zone $1),
                  $3::interval) gs
       )
       select to_char(f.local, 'YYYY-MM-DD') as inicio,
         (select count(distinct s.user_id)::int from sessions s
           where s.created_at < f.fim and s.last_used_at >= f.ini) as ativas,
         (select count(*)::int from users u
           where u.created_at >= f.ini and u.created_at < f.fim) as novas
       from faixas f
       order by f.local`,
      parametros,
    ),

    consultar<{ categoria: (typeof CATEGORIAS)[number]; atual: number; anterior: number }>(
      `${LIMITES}
       select 'novas_contas' as categoria,
              count(*) filter (where u.created_at >= l.ini and u.created_at < l.fim)::int as atual,
              count(*) filter (where u.created_at >= l.ini_ant and u.created_at < l.ini)::int as anterior
         from l, users u
       union all
       select 'contas_com_acesso',
              count(distinct s.user_id) filter (where s.created_at < l.fim and s.last_used_at >= l.ini)::int,
              count(distinct s.user_id) filter (where s.created_at < l.ini and s.last_used_at >= l.ini_ant)::int
         from l, sessions s
       union all
       select 'medicamentos',
              count(*) filter (where m.created_at >= l.ini and m.created_at < l.fim)::int,
              count(*) filter (where m.created_at >= l.ini_ant and m.created_at < l.ini)::int
         from l, medications m
       union all
       select 'doses',
              count(*) filter (where d.created_at >= l.ini and d.created_at < l.fim)::int,
              count(*) filter (where d.created_at >= l.ini_ant and d.created_at < l.ini)::int
         from l, medication_doses d
        where d.status = 'tomada'
       union all
       select 'consultas',
              count(*) filter (where a.scheduled_at >= l.ini and a.scheduled_at < l.fim)::int,
              count(*) filter (where a.scheduled_at >= l.ini_ant and a.scheduled_at < l.ini)::int
         from l, appointments a
       union all
       select 'leituras',
              count(*) filter (where r.created_at >= l.ini and r.created_at < l.fim)::int,
              count(*) filter (where r.created_at >= l.ini_ant and r.created_at < l.ini)::int
         from l, medication_photo_reads r
       union all
       select 'mensagens',
              count(*) filter (where w.sent_at >= l.ini and w.sent_at < l.fim)::int,
              count(*) filter (where w.sent_at >= l.ini_ant and w.sent_at < l.ini)::int
         from l, whatsapp_sends w
        where w.status = 'enviada'`,
      parametros,
    ),

    // Plano nao tem historico no banco: so da para mostrar a foto de agora.
    consultar<{ assinantes: number; em_teste: number }>(
      `select count(*) filter (where premium_until > now())::int as assinantes,
              count(*) filter (where (premium_until is null or premium_until <= now())
                                 and trial_ends_at > now())::int as em_teste
         from users
        where is_active`,
    ),
  ]);

  await registrar({
    adminId: admin.id,
    acao: 'ver_relatorios',
    recurso: 'relatorios',
    ip: ipDe(request),
    detalhes: { periodo },
  });

  const porCategoria = new Map(totais.map((t) => [t.categoria, t]));
  return json(200, {
    periodo,
    faixa,
    inicio: serie[0]?.inicio ?? null,
    serie,
    consolidado: CATEGORIAS.map((categoria) => ({
      categoria,
      atual: porCategoria.get(categoria)?.atual ?? 0,
      anterior: porCategoria.get(categoria)?.anterior ?? 0,
    })),
    plano: atuais[0],
    atualizadoEm: new Date().toISOString(),
  });
}
