import { and, desc, eq, gte, inArray, isNotNull, lt, or, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { medicationDoses, medications } from '../db/schema';
import { serializarDose } from './serialize';

/**
 * Historico de um remedio NA VIDA da pessoa, e nao so do cadastro aberto.
 *
 * Cada tratamento e uma linha propria em `medications`: a Amoxicilina de 2025
 * (encerrada) e a de 2026 nao tem ligacao nenhuma no banco. "Quantas vezes ela
 * ja tomou" so faz sentido somando as duas, entao os cadastros irmaos sao
 * achados pelo NOME normalizado — sem acento, minusculo, espacos colapsados.
 *
 * A comparacao e feita no JS, e nao com `unaccent` no Postgres: evita instalar
 * extensao, e a lista de remedios de UMA pessoa e pequena.
 *
 * So do MESMO perfil: o mesmo nome em outra pessoa da familia e outro
 * historico. A concentracao NAO entra na chave — 500mg e 875mg da mesma
 * substancia sao o mesmo remedio para "quantas vezes tomou".
 */
export function nomeNormalizado(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export async function cadastrosDoMesmoRemedio(profileId: string, nome: string) {
  const alvo = nomeNormalizado(nome);
  const todos = await db
    .select({ id: medications.id, name: medications.name, isActive: medications.isActive })
    .from(medications)
    .where(eq(medications.profileId, profileId));
  return todos.filter((m) => nomeNormalizado(m.name) === alvo);
}

export type Resumo = {
  tomadas: number;
  puladas: number;
  atrasadas: number;
  /** takenAt da dose mais antiga do periodo, ou null sem doses. */
  primeira: string | null;
  ultima: string | null;
  /** Em quantos cadastros (tratamentos) houve dose no periodo. */
  tratamentos: number;
};

const SEPARADOR = '~';

function lerCursor(cursor: string | undefined): { em: Date; id: string } | null {
  if (!cursor) return null;
  const [iso, id] = cursor.split(SEPARADOR);
  const em = new Date(iso ?? '');
  if (!id || Number.isNaN(em.getTime())) return null;
  return { em, id };
}

/**
 * Resumo e uma pagina das doses, da mais recente para a mais antiga.
 *
 * Cada registro conta como uma dose, inclusive no "se necessario": duas
 * dipironas no mesmo dia sao duas doses tomadas, nao duplicata.
 *
 * Doses sem takenAt (nao deveriam existir — o registro preenche "agora") ficam
 * de fora: sem instante, nao ha onde coloca-las na linha do tempo.
 */
export async function historicoDoRemedio(p: {
  profileId: string;
  nome: string;
  desde?: string;
  antes?: string;
  limite: number;
}) {
  const cadastros = await cadastrosDoMesmoRemedio(p.profileId, p.nome);
  const ids = cadastros.map((c) => c.id);
  const vazio = {
    resumo: { tomadas: 0, puladas: 0, atrasadas: 0, primeira: null, ultima: null, tratamentos: 0 } as Resumo,
    doses: [],
    proximo: null,
  };
  if (ids.length === 0) return vazio;

  const base = [inArray(medicationDoses.medicationId, ids), isNotNull(medicationDoses.takenAt)];
  if (p.desde) base.push(gte(medicationDoses.takenAt, new Date(p.desde)));

  const cursor = lerCursor(p.antes);
  const pagina = [...base];
  if (cursor) {
    pagina.push(
      or(
        lt(medicationDoses.takenAt, cursor.em),
        and(eq(medicationDoses.takenAt, cursor.em), lt(medicationDoses.id, cursor.id)),
      )!,
    );
  }

  const [[r], linhas] = await Promise.all([
    db
      .select({
        tomadas: sql<number>`count(*) filter (where ${medicationDoses.status} = 'tomada')::int`,
        puladas: sql<number>`count(*) filter (where ${medicationDoses.status} = 'pulada')::int`,
        atrasadas: sql<number>`count(*) filter (where ${medicationDoses.status} = 'atrasada')::int`,
        primeira: sql<Date | null>`min(${medicationDoses.takenAt})`,
        ultima: sql<Date | null>`max(${medicationDoses.takenAt})`,
        tratamentos: sql<number>`count(distinct ${medicationDoses.medicationId})::int`,
      })
      .from(medicationDoses)
      .where(and(...base)),
    db
      .select()
      .from(medicationDoses)
      .where(and(...pagina))
      .orderBy(desc(medicationDoses.takenAt), desc(medicationDoses.id))
      .limit(p.limite + 1),
  ]);

  const temMais = linhas.length > p.limite;
  const doses = linhas.slice(0, p.limite);
  const ultimaDaPagina = doses[doses.length - 1];
  const porId = new Map(cadastros.map((c) => [c.id, c]));

  // min/max chegam como texto pelo driver HTTP do Neon; Date normaliza.
  const iso = (v: Date | string | null | undefined) => (v ? new Date(v).toISOString() : null);

  return {
    resumo: {
      tomadas: r?.tomadas ?? 0,
      puladas: r?.puladas ?? 0,
      atrasadas: r?.atrasadas ?? 0,
      primeira: iso(r?.primeira),
      ultima: iso(r?.ultima),
      tratamentos: r?.tratamentos ?? 0,
    } satisfies Resumo,
    doses: doses.map((d) => ({
      ...serializarDose(d),
      medicationName: porId.get(d.medicationId)?.name ?? null,
      medicationActive: porId.get(d.medicationId)?.isActive ?? null,
    })),
    proximo:
      temMais && ultimaDaPagina
        ? `${ultimaDaPagina.takenAt!.toISOString()}${SEPARADOR}${ultimaDaPagina.id}`
        : null,
  };
}
