/**
 * O instante atual do APARELHO, escrito com o fuso dentro.
 *
 * Existe porque o servidor roda em UTC e nao tem como saber que dia e "hoje"
 * para quem esta perguntando. `toISOString()` sozinho nao resolve: ele devolve
 * o instante certo, mas em UTC — e as 22h de terca em Sao Paulo viram
 * quarta-feira 01:00 para quem so le a string. O assistente responderia
 * "amanha" sobre algo que e hoje.
 *
 * O formato e "2026-09-24T19:30:00-03:00": mesmo instante, dito do ponto de
 * vista de quem perguntou.
 */

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

export function agoraLocalISO(data = new Date()): string {
  // getTimezoneOffset() devolve MINUTOS PARA CHEGAR AO UTC, com o sinal ao
  // contrario do que se escreve: Sao Paulo (UTC-3) devolve +180.
  const deslocamento = -data.getTimezoneOffset();
  const sinal = deslocamento >= 0 ? '+' : '-';
  const bruto = Math.abs(deslocamento);

  const dia =
    `${data.getFullYear()}-${doisDigitos(data.getMonth() + 1)}-${doisDigitos(data.getDate())}`;
  const hora =
    `${doisDigitos(data.getHours())}:${doisDigitos(data.getMinutes())}:${doisDigitos(data.getSeconds())}`;

  return `${dia}T${hora}${sinal}${doisDigitos(Math.floor(bruto / 60))}:${doisDigitos(bruto % 60)}`;
}

/**
 * O nome do fuso, quando o aparelho souber dizer.
 *
 * `Intl` depende do ICU embarcado no Hermes, que varia entre versoes e
 * plataformas — e nada no aplicativo dependia dele ate agora. Por isso vem
 * protegido e e OPCIONAL: sem o nome, o deslocamento acima ja basta para
 * acertar as horas. O nome so acrescenta o horario de verao ao raciocinio.
 */
export function fusoDoAparelho(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}
