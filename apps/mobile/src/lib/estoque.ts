import { addDays, differenceInCalendarDays, isValid, parse, startOfDay } from 'date-fns';

import type { Medication, Stock } from '@/api/health';
import { somenteDigitos } from '@/lib/pessoa';

/**
 * A matematica do estoque de remedios, do lado do aparelho.
 *
 * O servidor deriva QUANTO sobra (compras menos doses tomadas — ver
 * apps/api/src/lib/estoque.ts). Quanto TEMPO isso dura e daqui, pelo mesmo
 * motivo de lib/posologia.ts: "hoje" e o dia do aparelho.
 *
 * A REGRA DE "ESTOQUE BAIXO" EXISTE EM DOIS LUGARES e precisa continuar igual:
 * aqui, que acende a etiqueta e agenda o lembrete local, e em
 * apps/api/src/handlers/assistant/cron-lembretes.ts (funcao `estoqueBaixo`,
 * com `dosesPorDia` de apps/api/src/lib/grade-de-doses.ts), que manda o aviso
 * por WhatsApp. Se uma mudar sozinha, a tela diz "suficiente" no mesmo dia em
 * que o WhatsApp avisa que esta acabando. Mudar la, mudar aqui.
 *
 * Modulo puro, sem React.
 */

/** Acaba em ate 7 dias = baixo. Igual a DIAS_DE_ESTOQUE_BAIXO do cron. */
export const DIAS_DE_ESTOQUE_BAIXO = 7;

/** Para "se necessario", que nao tem ritmo: sobrou 25% ou menos da ultima compra. */
const FRACAO_BAIXA_SE_NECESSARIO = 0.25;

/** Validade em ate 30 dias = proxima. */
export const DIAS_DE_VALIDADE_PROXIMA = 30;

type Posologia = Pick<
  Medication,
  'scheduleType' | 'intervalHours' | 'times' | 'weekdays' | 'dayInterval' | 'doseAmount'
>;

/**
 * Quantas DOSES por dia, em media.
 *
 * Espelha `dosesPorDia` do servidor: intervalo vira 24/h; horarios fixos sao
 * multiplicados pela fracao de dias com dose (dias da semana marcados / 7, ou
 * 1/N no "a cada N dias"); "se necessario" e zero — nao ha como prever.
 */
export function dosesPorDia(m: Posologia): number {
  if (m.scheduleType === 'as_needed') return 0;
  if (m.scheduleType === 'interval') return m.intervalHours ? 24 / m.intervalHours : 0;

  let fator = 1;
  if (m.weekdays) {
    let dias = 0;
    for (let i = 0; i < 7; i++) dias += (m.weekdays >> i) & 1;
    fator = dias / 7;
  } else if (m.dayInterval && m.dayInterval > 1) {
    fator = 1 / m.dayInterval;
  }
  return m.times.length * fator;
}

/** UNIDADES por dia: doses vezes a quantidade de cada dose (1 sem cadastro). */
export function unidadesPorDia(m: Posologia): number {
  return dosesPorDia(m) * (m.doseAmount ?? 1);
}

/** Quantos dias o que sobrou dura, ou null quando nao ha ritmo para prever. */
export function diasRestantes(m: Posologia, estoque: Stock): number | null {
  const porDia = unidadesPorDia(m);
  if (porDia <= 0) return null;
  return estoque.remaining / porDia;
}

/**
 * O dia em que o estoque acaba, ou null.
 *
 * Arredonda PARA BAIXO: 3,8 dias de remedio acabam no terceiro dia, e prometer
 * o quarto faria a pessoa comprar atrasada.
 */
export function dataDeTermino(m: Posologia, estoque: Stock, agora: Date): Date | null {
  const dias = diasRestantes(m, estoque);
  if (dias == null) return null;
  return addDays(startOfDay(agora), Math.floor(dias));
}

/** A mesma regra do cron — ver o cabecalho deste arquivo. */
export function estoqueBaixo(m: Posologia, estoque: Stock): boolean {
  if (estoque.remaining <= 0) return true;
  const dias = diasRestantes(m, estoque);
  if (dias != null) return dias <= DIAS_DE_ESTOQUE_BAIXO;
  return estoque.remaining <= estoque.lastPurchaseUnits * FRACAO_BAIXA_SE_NECESSARIO;
}

/** "2026-12-15" -> Date local a meia-noite. Sem `new Date(iso)`, que leria UTC. */
function dataLocal(iso: string): Date | null {
  const [a, m, d] = iso.slice(0, 10).split('-').map(Number);
  if (!a || !m || !d) return null;
  return new Date(a, m - 1, d);
}

/**
 * A validade vence em ate 30 dias.
 *
 * O servidor ja devolve so validades FUTURAS (ou de hoje), entao "vencida" nao
 * chega aqui; o `>= 0` e so cinto de seguranca.
 */
export function validadeProxima(estoque: Stock, agora: Date): boolean {
  if (!estoque.expiresOn) return false;
  const data = dataLocal(estoque.expiresOn);
  if (!data) return false;
  const dias = differenceInCalendarDays(data, agora);
  return dias <= DIAS_DE_VALIDADE_PROXIMA;
}

/** Nivel da barra: o que sobrou sobre a ultima compra, entre 0 e 1. */
export function nivel(estoque: Stock): number {
  if (estoque.lastPurchaseUnits <= 0) return 0;
  return Math.max(0, Math.min(1, estoque.remaining / estoque.lastPurchaseUnits));
}

// ---------------------------------------------------------------------------
// Apresentacao
// ---------------------------------------------------------------------------

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/**
 * "28 de junho" — com o ano so quando nao e o ano corrente.
 *
 * Nomes de mes na mao, e nao toLocaleDateString com `month: 'long'`: o Intl do
 * Hermes varia entre versoes do Android, e a data de termino e a informacao
 * principal do cartao.
 */
export function diaPorExtenso(d: Date, agora: Date): string {
  const base = `${d.getDate()} de ${MESES[d.getMonth()]}`;
  return d.getFullYear() === agora.getFullYear() ? base : `${base} de ${d.getFullYear()}`;
}

/** "2026-12-15" -> "15 dez 2026", como no mockup. */
export function validadeCurta(iso: string): string {
  const d = dataLocal(iso);
  if (!d) return iso;
  return `${String(d.getDate()).padStart(2, '0')} ${MESES[d.getMonth()]!.slice(0, 3)} ${d.getFullYear()}`;
}

const UNIDADES: Record<string, [string, string]> = {
  'cápsula': ['cápsula', 'cápsulas'],
  capsula: ['cápsula', 'cápsulas'],
  comprimido: ['comprimido', 'comprimidos'],
  gotas: ['gota', 'gotas'],
  gota: ['gota', 'gotas'],
  ml: ['ml', 'ml'],
  jato: ['jato', 'jatos'],
};

/**
 * "8 cápsulas", "1 comprimido", "12,5 ml".
 *
 * Nao reusa quantidadeComUnidade de posologia.ts porque o `form` 'outro' (e o
 * nulo) precisam virar "unidades" — la eles sairiam como "5 outro".
 */
export function quantidadeDoEstoque(n: number, form: string | null | undefined): string {
  const [um, varios] = UNIDADES[(form ?? '').toLowerCase().trim()] ?? ['unidade', 'unidades'];
  const numero = Number.isInteger(n) ? String(n) : String(n).replace('.', ',');
  return `${numero} ${n === 1 ? um : varios}`;
}

/**
 * Validade digitada "15/12/2026" -> "2026-12-15", ou null se a data nao existe.
 *
 * Mesmo parse estrito de pessoa.ts (recusa 31/02). Aceita ate 10 anos a frente
 * e recusa o passado: registrar uma caixa ja vencida e quase sempre erro de
 * digitacao, e se nao for, o lugar dela e o lixo, nao o estoque.
 */
export function validadeParaISO(texto: string): string | null {
  if (somenteDigitos(texto).length !== 8) return null;
  const d = parse(texto, 'dd/MM/yyyy', new Date());
  if (!isValid(d)) return null;

  const hoje = startOfDay(new Date());
  if (d < hoje) return null;
  if (d.getFullYear() > hoje.getFullYear() + 10) return null;

  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}
