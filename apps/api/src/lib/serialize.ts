import type { medicationDoses, medications, profiles } from '../db/schema';

/**
 * Conversoes entre o que o driver do Postgres entrega e o que o aplicativo
 * espera. Duas, ambas chatas de descobrir na tela:
 *
 *  - `numeric` chega como STRING ("1", "5.00"), nunca como numero.
 *  - `time` chega como "08:00:00", e o aplicativo quer "08:00".
 *
 * Mesmo papel do `serializar()` de api/professionals/index.ts, aqui num
 * arquivo de src/ porque dois handlers precisam.
 */

function numero(valor: string | null): number | null {
  return valor === null ? null : Number(valor);
}

/** "08:00:00" -> "08:00". O Postgres completa os segundos sozinho na escrita. */
export function horaCurta(timeOfDay: string): string {
  return timeOfDay.slice(0, 5);
}

export function serializarDose(d: typeof medicationDoses.$inferSelect) {
  return { ...d, amount: numero(d.amount) };
}

export function serializarMedicamento(m: typeof medications.$inferSelect) {
  return { ...m, doseAmount: numero(m.doseAmount) };
}

/**
 * Perfis passaram a precisar disto quando ganharam weight_kg: ate entao a
 * tabela nao tinha nenhuma coluna numeric e o select saia pronto.
 *
 * Precisa ser aplicado nos DOIS handlers de perfil. Com so um deles, a
 * listagem devolveria numero e o detalhe texto (ou o contrario), e o
 * typecheck nao pega — o servidor responde unknown.
 */
export function serializarPerfil(p: typeof profiles.$inferSelect) {
  return { ...p, weightKg: numero(p.weightKg) };
}
