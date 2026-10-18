/**
 * Os horarios de dose de um remedio, calculados NO SERVIDOR, no fuso da familia.
 *
 * E a PORTA do `slotsDoDia` do aplicativo (apps/mobile/src/lib/posologia.ts),
 * e as duas precisam concordar: a mensagem de WhatsApp das 08:00 tem que sair
 * na mesma hora em que o celular mostra "proxima dose 08:00". Qualquer mudanca
 * de regra la (padrao de dias, total de doses) precisa vir para ca.
 *
 * Por que existe: ate os lembretes por WhatsApp, o servidor era agnostico de
 * fuso e o celular fazia todo o calculo. Agora quem dispara e o servidor, que
 * roda em UTC — e "08:00" so vira instante com um fuso. Sem dependencia nova: o
 * `Intl` do Node resolve fuso IANA, inclusive horario de verao.
 */

export const FUSO_PADRAO = 'America/Sao_Paulo';

export type RemedioDaGrade = {
  scheduleType: 'interval' | 'fixed_times' | 'as_needed';
  intervalHours: number | null;
  /** "HH:MM" */
  times: string[];
  dayInterval: number | null;
  weekdays: number | null;
  totalDoses: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  createdAt: Date;
};

/** Um dia de CALENDARIO local, sem hora. */
export type Dia = { ano: number; mes: number; dia: number };

const MS_DIA = 86_400_000;
const formatadores = new Map<string, Intl.DateTimeFormat>();

export function fusoValido(fuso: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

function formatador(fuso: string): Intl.DateTimeFormat {
  let f = formatadores.get(fuso);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: fuso,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatadores.set(fuso, f);
  }
  return f;
}

/** A hora de parede, naquele fuso, de um instante. */
export function partesLocais(ms: number, fuso: string) {
  const o: Record<string, number> = {};
  for (const p of formatador(fuso).formatToParts(new Date(ms))) {
    if (p.type !== 'literal') o[p.type] = Number(p.value);
  }
  return { ano: o.year!, mes: o.month!, dia: o.day!, hora: o.hour!, minuto: o.minute!, segundo: o.second! };
}

/** Quanto o fuso esta a frente do UTC naquele instante, em ms (-3h = -10800000). */
function deslocamento(ms: number, fuso: string): number {
  const inteiro = ms - (((ms % 1000) + 1000) % 1000);
  const p = partesLocais(inteiro, fuso);
  return Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo) - inteiro;
}

/** O instante de uma hora de parede local. Duas passadas cobrem o horario de verao. */
export function instanteLocal(d: Dia, hora: number, minuto: number, fuso: string): number {
  const chute = Date.UTC(d.ano, d.mes - 1, d.dia, hora, minuto);
  const primeira = chute - deslocamento(chute, fuso);
  return chute - deslocamento(primeira, fuso);
}

export function diaLocal(ms: number, fuso: string): Dia {
  const p = partesLocais(ms, fuso);
  return { ano: p.ano, mes: p.mes, dia: p.dia };
}

export function somarDias(d: Dia, n: number): Dia {
  const t = new Date(Date.UTC(d.ano, d.mes - 1, d.dia) + n * MS_DIA);
  return { ano: t.getUTCFullYear(), mes: t.getUTCMonth() + 1, dia: t.getUTCDate() };
}

function diasEntre(a: Dia, b: Dia): number {
  return Math.round((Date.UTC(b.ano, b.mes - 1, b.dia) - Date.UTC(a.ano, a.mes - 1, a.dia)) / MS_DIA);
}

/** 0 = domingo, como o bitmask de `weekdays`. */
function diaDaSemana(d: Dia): number {
  return new Date(Date.UTC(d.ano, d.mes - 1, d.dia)).getUTCDay();
}

function ancora(m: RemedioDaGrade): number {
  return (m.startsAt ?? m.createdAt).getTime();
}

function diaValido(m: RemedioDaGrade, d: Dia, fuso: string): boolean {
  if (m.scheduleType !== 'fixed_times') return true;
  if (m.weekdays) return ((m.weekdays >> diaDaSemana(d)) & 1) === 1;
  if (m.dayInterval && m.dayInterval > 1) {
    const n = diasEntre(diaLocal(ancora(m), fuso), d);
    return n >= 0 && n % m.dayInterval === 0;
  }
  return true;
}

/** A grade do dia SEM o corte do total de doses (que depende dela). */
function slotsCrus(m: RemedioDaGrade, d: Dia, fuso: string): number[] {
  if (m.scheduleType === 'as_needed') return [];

  const inicio = instanteLocal(d, 0, 0, fuso);
  const fim = instanteLocal(somarDias(d, 1), 0, 0, fuso) - 1;
  const slots: number[] = [];

  if (m.scheduleType === 'fixed_times') {
    if (!diaValido(m, d, fuso)) return [];
    for (const hhmm of m.times) {
      const [h, min] = hhmm.split(':').map(Number);
      slots.push(instanteLocal(d, h!, min!, fuso));
    }
  } else {
    const passo = (m.intervalHours ?? 0) * 3_600_000;
    if (passo <= 0) return [];
    const a = ancora(m);
    let t = a + Math.max(0, Math.ceil((inicio - a) / passo)) * passo;
    while (t <= fim) {
      if (t >= inicio) slots.push(t);
      t += passo;
    }
  }

  const comeca = m.startsAt?.getTime() ?? null;
  const termina = m.endsAt?.getTime() ?? null;
  return slots
    .filter((s) => (comeca === null || s >= comeca) && (termina === null || s <= termina))
    .sort((a, b) => a - b);
}

/** Freio do laco: 500 doses semanais cabem com folga em 10 anos. */
const DIAS_MAXIMOS_DE_CONTAGEM = 3650;

/** O instante da ULTIMA dose quando ha `totalDoses`; null sem limite. */
export function ultimoSlot(m: RemedioDaGrade, fuso: string): number | null {
  if (!m.totalDoses || m.scheduleType === 'as_needed') return null;
  const a = ancora(m);
  if (m.scheduleType === 'interval') {
    const passo = (m.intervalHours ?? 0) * 3_600_000;
    return passo > 0 ? a + (m.totalDoses - 1) * passo : null;
  }
  let contadas = 0;
  const primeiro = diaLocal(a, fuso);
  for (let i = 0; i < DIAS_MAXIMOS_DE_CONTAGEM; i++) {
    for (const s of slotsCrus(m, somarDias(primeiro, i), fuso)) {
      if (s < a) continue;
      contadas += 1;
      if (contadas === m.totalDoses) return s;
    }
  }
  return null;
}

export function slotsDoDia(m: RemedioDaGrade, d: Dia, fuso: string): number[] {
  const ultimo = ultimoSlot(m, fuso);
  return slotsCrus(m, d, fuso).filter((s) => ultimo === null || s <= ultimo);
}

/** Todos os horarios em (de, ate], olhando os dias locais que a janela toca. */
export function slotsEntre(m: RemedioDaGrade, de: number, ate: number, fuso: string): number[] {
  const primeiro = diaLocal(de, fuso);
  const ultimo = diaLocal(ate, fuso);
  const n = diasEntre(primeiro, ultimo);
  const todos: number[] = [];
  for (let i = 0; i <= n; i++) todos.push(...slotsDoDia(m, somarDias(primeiro, i), fuso));
  return todos.filter((s) => s > de && s <= ate);
}

/**
 * Quantas doses por dia, em media — base da previsao de termino do estoque.
 * "Se necessario" nao tem ritmo: devolve 0.
 */
export function dosesPorDia(m: RemedioDaGrade): number {
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
