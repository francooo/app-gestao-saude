import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';

import { db } from '../db/client';
import { medicationDoses, medicationStockEntries } from '../db/schema';

/**
 * O estoque de cada remedio, DERIVADO: compras menos doses tomadas.
 *
 * Ver o cabecalho de medication_stock_entries para o porque de nao guardar o
 * restante numa coluna. Remedio sem nenhuma compra devolve null — "nao
 * controlo estoque deste", que e diferente de "acabou".
 *
 * O que SAIU conta so doses 'tomada' a partir da PRIMEIRA compra: o que foi
 * tomado antes de existir estoque nao pode descontar de uma caixa comprada
 * depois. Cada dose desconta `amount` (o que a pessoa disse que tomou) ou, sem
 * ele, a dose cadastrada do remedio, ou 1.
 */
export type Estoque = {
  /** Soma das compras. */
  purchased: number;
  /** Nunca negativo: dose registrada a mais nao vira estoque devedor. */
  remaining: number;
  /** Validade mais proxima ainda futura (AAAA-MM-DD), ou null. */
  expiresOn: string | null;
  /** Local da compra mais recente. */
  place: string | null;
  lastPurchaseAt: string | null;
  /** Unidades da compra mais recente — referencia de "caixa cheia" na tela. */
  lastPurchaseUnits: number;
};

type Medicamento = { id: string; doseAmount: string | null };

export async function estoquesDe(meds: Medicamento[]): Promise<Map<string, Estoque>> {
  const resultado = new Map<string, Estoque>();
  if (meds.length === 0) return resultado;
  const ids = meds.map((m) => m.id);

  const compras = await db
    .select()
    .from(medicationStockEntries)
    .where(inArray(medicationStockEntries.medicationId, ids))
    .orderBy(desc(medicationStockEntries.purchasedAt));
  if (compras.length === 0) return resultado;

  const porRemedio = new Map<string, typeof compras>();
  for (const c of compras) {
    const lista = porRemedio.get(c.medicationId) ?? [];
    lista.push(c);
    porRemedio.set(c.medicationId, lista);
  }

  // Data de "hoje" so para comparar validade: a granularidade e o dia, e um
  // dia de diferenca de fuso nao muda "vence em dezembro".
  const hoje = new Date().toISOString().slice(0, 10);

  for (const m of meds) {
    const lista = porRemedio.get(m.id);
    if (!lista) continue;

    const primeira = lista.reduce((a, b) => (a.purchasedAt < b.purchasedAt ? a : b));
    const doseCadastrada = m.doseAmount != null ? Number(m.doseAmount) : 1;

    const [saida] = await db
      .select({
        total: sql<string>`coalesce(sum(coalesce(${medicationDoses.amount}, ${doseCadastrada})), 0)`,
      })
      .from(medicationDoses)
      .where(
        and(
          eq(medicationDoses.medicationId, m.id),
          eq(medicationDoses.status, 'tomada'),
          gte(medicationDoses.takenAt, primeira.purchasedAt),
        ),
      );

    const comprado = lista.reduce((s, c) => s + c.units, 0);
    const usado = Number(saida?.total ?? 0);
    const validades = lista
      .map((c) => c.expiresOn)
      .filter((v): v is string => !!v && v >= hoje)
      .sort();
    const ultima = lista[0]!;

    resultado.set(m.id, {
      purchased: comprado,
      remaining: Math.max(0, Math.round((comprado - usado) * 10) / 10),
      expiresOn: validades[0] ?? null,
      place: ultima.place,
      lastPurchaseAt: ultima.purchasedAt.toISOString(),
      lastPurchaseUnits: ultima.units,
    });
  }

  return resultado;
}
