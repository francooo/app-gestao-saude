import type { scheduleTypeValues } from '../contracts';

/**
 * Consistencia entre o tipo de horario e os campos que ele exige.
 *
 * Mora aqui, e nao no schema zod, por dois motivos. Primeiro, em zod o
 * `.superRefine()` devolve um ZodEffects, que nao tem `.partial()` — e o PATCH
 * precisa de `.partial()`. Segundo, no PATCH a regra so pode ser avaliada
 * depois de mesclar o corpo com a linha que ja esta no banco: quem manda so
 * `{ name }` nao deveria ser obrigado a reenviar o intervalo.
 *
 * O caso do `interval` espelha o CHECK medications_interval_requires_hours.
 * Sem este espelho, o banco recusaria e a pessoa veria um 500 onde deveria ver
 * qual campo faltou.
 */
export function validarPosologia(m: {
  scheduleType: (typeof scheduleTypeValues)[number];
  intervalHours?: number | null;
  times?: string[];
  startsAt?: string | Date | null;
  endsAt?: string | Date | null;
  dayInterval?: number | null;
  weekdays?: number | null;
  totalDoses?: number | null;
}): Record<string, string> | null {
  const erros: Record<string, string> = {};
  const horarios = m.times ?? [];

  if (m.scheduleType === 'interval' && !(m.intervalHours && m.intervalHours > 0)) {
    erros.intervalHours = 'Informe de quantas em quantas horas';
  }

  if (m.scheduleType === 'fixed_times' && horarios.length === 0) {
    erros.times = 'Informe ao menos um horário';
  }

  if (m.scheduleType !== 'fixed_times' && horarios.length > 0) {
    erros.times = 'Horários fixos só valem para esse tipo de agendamento';
  }

  // Horario repetido: o banco tem unique em (medicamento, horario) e devolveria
  // 500. Aqui vira uma mensagem util.
  if (new Set(horarios).size !== horarios.length) {
    erros.times = 'Há horários repetidos';
  }

  // Padroes de dias so fazem sentido com horario fixo: "a cada N horas" ja
  // cobre 48h/72h pelo intervalo livre. E os dois padroes nao se somam.
  const temPadraoDeDias = m.dayInterval != null || m.weekdays != null;
  if (temPadraoDeDias && m.scheduleType !== 'fixed_times') {
    erros.dayInterval = 'Repetir em dias só vale para horários fixos';
  }
  if (m.dayInterval != null && m.weekdays != null) {
    erros.weekdays = 'Escolha "a cada N dias" ou "dias da semana", não os dois';
  }
  if (m.totalDoses != null && m.scheduleType === 'as_needed') {
    erros.totalDoses = 'Total de doses não vale para "se necessário"';
  }

  if (m.startsAt && m.endsAt && new Date(m.endsAt) <= new Date(m.startsAt)) {
    erros.endsAt = 'O fim do tratamento precisa ser depois do início';
  }

  return Object.keys(erros).length > 0 ? erros : null;
}
