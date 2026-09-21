import { addDays, addHours, endOfDay, isSameDay, set, startOfDay } from 'date-fns';

import type { Dose, Medication } from '@/api/health';

/**
 * Toda a matematica de horarios da tela de Remedios.
 *
 * Modulo PURO de proposito: o servidor nao tem opiniao sobre fuso (roda em
 * UTC, e um CURRENT_DATE la viraria o dia as 21h de Brasilia), entao todo o
 * calculo de "hoje", "proxima dose" e "tomado as" acontece aqui, no fuso do
 * aparelho. Concentrar isso num arquivo sem React e o que torna a parte mais
 * escorregadia do recurso possivel de conferir lendo.
 *
 * Aritmetica de data sempre pelo date-fns, nunca somando milissegundos:
 * `Date.now() + 86400000` erra em qualquer fuso com horario de verao.
 */

/** Folga para marcar a dose um pouco antes da hora, que e o que se faz. */
const FOLGA_ANTECIPACAO_MIN = 15;

/** Quantos dias a frente procurar a proxima dose. */
const DIAS_A_FRENTE = 2;

// ---------------------------------------------------------------------------
// Grade de horarios
// ---------------------------------------------------------------------------

/**
 * Os horarios previstos de um medicamento num dia.
 *
 * A grade e ANCORADA em startsAt (com createdAt de reserva, porque startsAt e
 * nulavel mesmo no 'interval'), e nao derivada da ultima dose tomada. E ela
 * que da um DENOMINADOR: sem grade, "2 doses de 3 medicamentos" nao teria
 * sentido definido e o card de resumo nao poderia existir.
 */
export function slotsDoDia(m: Medication, dia: Date): Date[] {
  if (m.scheduleType === 'as_needed') return [];

  const inicioDoDia = startOfDay(dia);
  const fimDoDia = endOfDay(dia);
  const slots: Date[] = [];

  if (m.scheduleType === 'fixed_times') {
    for (const hhmm of m.times) {
      const [h, min] = hhmm.split(':').map(Number);
      slots.push(set(inicioDoDia, { hours: h, minutes: min, seconds: 0, milliseconds: 0 }));
    }
  } else {
    const passo = m.intervalHours ?? 0;
    if (passo <= 0) return [];

    const ancora = new Date(m.startsAt ?? m.createdAt);
    // Anda de `passo` em `passo` a partir da ancora ate entrar no dia. Um laco
    // e mais legivel que a aritmetica modular, e sao poucas iteracoes.
    let t = ancora;
    while (t < inicioDoDia) t = addHours(t, passo);
    while (t <= fimDoDia) {
      slots.push(t);
      t = addHours(t, passo);
    }
  }

  const comeca = m.startsAt ? new Date(m.startsAt) : null;
  const termina = m.endsAt ? new Date(m.endsAt) : null;

  return slots
    .filter((s) => (!comeca || s >= comeca) && (!termina || s <= termina))
    .sort((a, b) => a.getTime() - b.getTime());
}

/**
 * A dose registrada para um horario, se houver.
 *
 * Casa por TOLERANCIA e nao por igualdade: se alguem editar startsAt, a grade
 * se desloca e todas as doses antigas ficariam orfas — a tela passaria a
 * mostrar como pendente o que ja foi tomado.
 */
export function doseNoSlot(m: Medication, doses: Dose[], slot: Date): Dose | null {
  const toleranciaMs =
    m.scheduleType === 'interval'
      ? Math.min(((m.intervalHours ?? 24) * 3_600_000) / 2, 2 * 3_600_000)
      : 30 * 60_000;

  for (const d of doses) {
    if (!d.scheduledFor) continue;
    if (Math.abs(new Date(d.scheduledFor).getTime() - slot.getTime()) < toleranciaMs) return d;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Proxima dose
// ---------------------------------------------------------------------------

/** Nulo para 'as_needed', para tratamento encerrado e para o que nao comecou. */
export function proximaDose(m: Medication, agora: Date): Date | null {
  if (m.scheduleType === 'as_needed' || !m.isActive) return null;

  const candidatos: Date[] = [];
  for (let i = 0; i < DIAS_A_FRENTE; i++) candidatos.push(...slotsDoDia(m, addDays(agora, i)));

  const pendentes = candidatos.filter((s) => s > agora && !doseNoSlot(m, m.doses, s));
  if (pendentes.length === 0) return null;

  // Para "a cada N horas", a grade sozinha mentiria: quem tomou as 13:50 nao
  // deve ver "proxima dose 14:00". O piso e o espacamento minimo real.
  if (m.scheduleType === 'interval' && m.lastDoseAt && m.intervalHours) {
    const piso = addHours(new Date(m.lastDoseAt), m.intervalHours);
    return pendentes.find((s) => s >= piso) ?? piso;
  }

  return pendentes[0]!;
}

/**
 * Qual horario o botao de marcar-como-tomado registra.
 *
 * O ultimo horario de hoje ja vencido e sem dose; senao o proximo de hoje;
 * senao nenhum, e o botao fica desabilitado.
 */
export function slotAlvo(m: Medication, agora: Date): Date | null {
  if (m.scheduleType === 'as_needed') return null;

  const limite = new Date(agora.getTime() + FOLGA_ANTECIPACAO_MIN * 60_000);
  const hoje = slotsDoDia(m, agora).filter((s) => !doseNoSlot(m, m.doses, s));

  const vencidos = hoje.filter((s) => s <= limite);
  return vencidos.at(-1) ?? hoje[0] ?? null;
}

// ---------------------------------------------------------------------------
// Estado de um medicamento hoje
// ---------------------------------------------------------------------------

export type EstadoHoje =
  | { tipo: 'nao_comecou'; em: Date }
  | { tipo: 'encerrado'; em: Date }
  | { tipo: 'inativo' }
  | { tipo: 'tomado'; quando: Date; dose: Dose; quantas: number }
  | { tipo: 'pendente'; quando: Date }
  | { tipo: 'se_necessario' }
  | { tipo: 'nada_hoje' };

export function estadoHoje(m: Medication, agora: Date): EstadoHoje {
  if (!m.isActive) return { tipo: 'inativo' };

  if (m.startsAt && new Date(m.startsAt) > endOfDay(agora)) {
    return { tipo: 'nao_comecou', em: new Date(m.startsAt) };
  }
  // endsAt vencido nao desativa nada no banco — nao ha job nem gatilho. Quem
  // esconde e a tela, coerente com a decisao de o servidor ignorar fuso.
  if (m.endsAt && new Date(m.endsAt) < startOfDay(agora)) {
    return { tipo: 'encerrado', em: new Date(m.endsAt) };
  }

  const tomadasHoje = m.doses
    .filter((d) => d.status === 'tomada' && d.takenAt && isSameDay(new Date(d.takenAt), agora))
    .sort((a, b) => new Date(a.takenAt!).getTime() - new Date(b.takenAt!).getTime());

  const proxima = proximaDose(m, agora);

  if (m.scheduleType === 'as_needed') {
    const ultima = tomadasHoje.at(-1);
    return ultima
      ? { tipo: 'tomado', quando: new Date(ultima.takenAt!), dose: ultima, quantas: tomadasHoje.length }
      : { tipo: 'se_necessario' };
  }

  // Mostrar a proxima tem prioridade sobre a ultima tomada: o que a pessoa
  // precisa saber e o que falta, nao o que ja fez.
  if (proxima && isSameDay(proxima, agora)) return { tipo: 'pendente', quando: proxima };

  const ultima = tomadasHoje.at(-1);
  if (ultima) {
    return { tipo: 'tomado', quando: new Date(ultima.takenAt!), dose: ultima, quantas: tomadasHoje.length };
  }

  return proxima ? { tipo: 'pendente', quando: proxima } : { tipo: 'nada_hoje' };
}

/** Vale para hoje: ativo e dentro do periodo do tratamento. */
export function vigenteHoje(m: Medication, agora: Date): boolean {
  if (!m.isActive) return false;
  if (m.startsAt && new Date(m.startsAt) > endOfDay(agora)) return false;
  if (m.endsAt && new Date(m.endsAt) < startOfDay(agora)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Resumo do dia
// ---------------------------------------------------------------------------

/**
 * Os dois cards do topo.
 *
 * A DEFINICAO, que o mockup fixa e que nao deve ser "corrigida" depois: o
 * numerador sao as DOSES tomadas hoje (inclui 'se necessario'); o denominador
 * sao os MEDICAMENTOS vigentes hoje — nao as doses previstas. E o que faz
 * "2 doses de 3 medicamentos" ler certo.
 */
export function resumoDoDia(medicamentos: Medication[], agora: Date) {
  const vigentes = medicamentos.filter((m) => vigenteHoje(m, agora));

  const dosesTomadas = vigentes.reduce(
    (total, m) =>
      total +
      m.doses.filter((d) => d.status === 'tomada' && d.takenAt && isSameDay(new Date(d.takenAt), agora))
        .length,
    0,
  );

  let proxima: { quando: Date; medicamento: Medication } | null = null;
  for (const m of vigentes) {
    const q = proximaDose(m, agora);
    if (q && (!proxima || q < proxima.quando)) proxima = { quando: q, medicamento: m };
  }

  return { dosesTomadas, totalMedicamentos: vigentes.length, proxima };
}

// ---------------------------------------------------------------------------
// Apresentacao
// ---------------------------------------------------------------------------

export type FormaVisual = 'capsula' | 'comprimido' | 'gotas' | 'ml';

/**
 * A coluna `form` e texto livre e o seed gravou com acento ('cápsula'), entao
 * normalizar antes de mapear nao e zelo excessivo: sem isso o ladrilho cai
 * sempre na reserva.
 */
export function formaVisual(form: string | null | undefined): FormaVisual {
  const limpo = (form ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

  if (limpo.startsWith('comprimido')) return 'comprimido';
  if (limpo.startsWith('gota')) return 'gotas';
  if (limpo === 'ml') return 'ml';
  return 'capsula';
}

const PLURAIS: Record<string, string> = {
  cápsula: 'cápsulas',
  capsula: 'cápsulas',
  comprimido: 'comprimidos',
  gota: 'gotas',
  gotas: 'gotas',
  ml: 'ml',
  dose: 'doses',
};

/** "1 cápsula", "2 cápsulas", "5 gotas". Nada de acrescentar 's'. */
export function quantidadeComUnidade(amount: number | null, unit: string | null): string | null {
  if (amount == null) return null;
  const numero = Number.isInteger(amount) ? String(amount) : String(amount).replace('.', ',');
  if (!unit) return numero;

  const chave = unit.toLowerCase().trim();
  const texto = amount === 1 ? unit : (PLURAIS[chave] ?? unit);
  return `${numero} ${texto}`;
}

/** "a cada 8 horas", "1x ao dia", "2x ao dia", "se necessário". */
export function descricaoDoHorario(m: Medication): string {
  if (m.scheduleType === 'as_needed') return 'se necessário';
  if (m.scheduleType === 'interval') {
    const h = m.intervalHours ?? 0;
    if (h === 24) return '1x ao dia';
    return `a cada ${h} ${h === 1 ? 'hora' : 'horas'}`;
  }
  const n = m.times.length;
  if (n === 0) return 'horários a definir';
  if (n === 1) return `todo dia às ${m.times[0]}`;
  return `${n}x ao dia`;
}

/** A segunda linha do card: "1 cápsula · a cada 8 horas". */
export function posologia(m: Medication): string {
  const dose = quantidadeComUnidade(m.doseAmount ?? null, m.doseUnit ?? null);
  return [dose, descricaoDoHorario(m)].filter(Boolean).join(' · ');
}

/** "Amoxicilina 500mg" */
export function tituloDoMedicamento(m: Medication): string {
  return [m.name, m.strength].filter(Boolean).join(' ');
}

/** "14:00", no fuso do aparelho. */
export function hora(d: Date): string {
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/** "26/09" */
export function diaCurto(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}
