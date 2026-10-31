import { registrar } from '../auditoria';
import type { Admin } from '../autenticar';
import { consultar } from '../db';
import { ipDe, json } from '../http';
import { paginar, parametrosDe } from '../listagem';

const SITUACOES = ['assinante', 'em_teste', 'teste_encerrado', 'assinatura_vencida', 'sem_plano'] as const;

/**
 * Planos das contas.
 *
 * A cobranca pela Google Play ainda nao existe (apps/mobile/app/(app)/conta/
 * assinatura.tsx), entao nao ha receita, preco nem historico de renovacao para
 * mostrar: so o estado atual que mora em users (trial_ends_at, premium_until,
 * premium_store). Quando o billing chegar, esta tela ganha os valores.
 */
export async function assinaturas(request: Request, admin: Admin): Promise<Response> {
  const p = parametrosDe(request);
  const situacao = p.filtro('situacao', SITUACOES);

  const [linhas, [numeros]] = await Promise.all([
    consultar<{
      id: string;
      nome: string;
      email: string;
      situacao: string;
      cadastro: string;
      fim: string | null;
      origem: string | null;
      produto: string | null;
      total: number;
    }>(
      `with base as (
         select u.id,
                coalesce(u.full_name, u.email::text) as nome,
                u.email::text as email,
                case when u.premium_until > now() then 'assinante'
                     when u.trial_ends_at > now() then 'em_teste'
                     when u.premium_until is not null then 'assinatura_vencida'
                     when u.trial_ends_at is not null then 'teste_encerrado'
                     else 'sem_plano' end as situacao,
                u.created_at as cadastro,
                case when u.premium_until is not null then u.premium_until else u.trial_ends_at end as fim,
                u.premium_store as origem,
                u.premium_product as produto
           from users u
          where u.is_active
       )
       select *, count(*) over ()::int as total
         from base
        where ($1::text is null or nome ilike $1 or email ilike $1)
          and ($2::text is null or situacao = $2)
        order by fim desc nulls last, cadastro desc
        limit 10 offset $3`,
      [p.padraoDeBusca, situacao, p.offset],
    ),

    consultar<{
      assinantes: number;
      em_teste: number;
      teste_acabando: number;
      teste_encerrado: number;
      assinatura_vencida: number;
      sem_plano: number;
      ja_assinaram: number;
      testes_concluidos: number;
    }>(
      `select
         count(*) filter (where premium_until > now())::int as assinantes,
         count(*) filter (where (premium_until is null or premium_until <= now()) and trial_ends_at > now())::int
           as em_teste,
         count(*) filter (where (premium_until is null or premium_until <= now())
                            and trial_ends_at > now() and trial_ends_at <= now() + interval '3 days')::int
           as teste_acabando,
         count(*) filter (where premium_until is null and trial_ends_at <= now())::int as teste_encerrado,
         count(*) filter (where premium_until <= now())::int as assinatura_vencida,
         count(*) filter (where premium_until is null and trial_ends_at is null)::int as sem_plano,
         count(*) filter (where premium_until is not null)::int as ja_assinaram,
         count(*) filter (where trial_ends_at <= now())::int as testes_concluidos
       from users where is_active`,
    ),
  ]);

  await registrar({
    adminId: admin.id,
    acao: 'listar_assinaturas',
    recurso: 'assinaturas',
    ip: ipDe(request),
    detalhes: { busca: p.busca, situacao, pagina: p.pagina },
  });

  return json(200, { numeros, lista: paginar(linhas, p.pagina) });
}
