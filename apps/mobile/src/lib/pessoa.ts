import { differenceInMonths, differenceInYears, isValid, parse } from 'date-fns';

/**
 * Data de nascimento, idade, peso e altura de um membro da familia.
 *
 * Modulo puro, sem React: e onde moram as conversoes de borda entre o que a
 * pessoa digita ("1,70 m", "01/01/1990") e o que o banco guarda (centimetros
 * inteiros, ISO yyyy-mm-dd). Concentrar isso aqui e o que deixa a tela livre
 * de aritmetica.
 */

// ---------------------------------------------------------------------------
// Data de nascimento
// ---------------------------------------------------------------------------

export function somenteDigitos(valor: string): string {
  return valor.replace(/\D/g, '');
}

/**
 * Mascara dd/mm/aaaa enquanto se digita, no molde de formatarCep.
 *
 * Existe mascara em vez de seletor porque nao ha seletor de data nativo no
 * aplicativo, e o Calendar do react-native-calendars esta configurado com
 * minDate de hoje — serve para agendar consulta, nao para nascimento. Digitar
 * tambem e mais rapido para quem sabe a data de cor.
 */
export function formatarData(valor: string): string {
  const d = somenteDigitos(valor).slice(0, 8);
  if (d.length <= 2) return d;
  if (d.length <= 4) return `${d.slice(0, 2)}/${d.slice(2)}`;
  return `${d.slice(0, 2)}/${d.slice(2, 4)}/${d.slice(4)}`;
}

/**
 * "01/01/1990" -> "1990-01-01", ou null se a data nao existe.
 *
 * O parse do date-fns com strict (o terceiro argumento e a data de
 * referencia) recusa 31/02: ele nao "rola" para 03/03 como o construtor Date
 * faria. E por isso que a validacao mora aqui e nao num regex.
 */
export function dataParaISO(texto: string): string | null {
  if (somenteDigitos(texto).length !== 8) return null;

  const d = parse(texto, 'dd/MM/yyyy', new Date());
  if (!isValid(d)) return null;

  // Nascimento no futuro e sempre erro de digitacao.
  if (d > new Date()) return null;

  const ano = d.getFullYear();
  if (ano < 1900) return null;

  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${ano}-${mm}-${dd}`;
}

/** "1990-01-01" -> "01/01/1990", para preencher o campo na edicao. */
export function isoParaData(iso: string | null | undefined): string {
  if (!iso) return '';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : '';
}

/**
 * "32 anos", "8 meses", "1 ano e 2 meses".
 *
 * Meses importam: um bebe de 8 meses descrito como "0 anos" nao informa nada,
 * e dose pediatrica depende justamente dessa faixa.
 */
export function idadeDescrita(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const nascimento = new Date(`${iso.slice(0, 10)}T00:00:00`);
  if (!isValid(nascimento)) return null;

  const agora = new Date();
  const anos = differenceInYears(agora, nascimento);

  if (anos >= 2) return `${anos} anos`;

  const meses = differenceInMonths(agora, nascimento);
  if (meses < 1) return 'menos de 1 mês';
  if (meses < 12) return `${meses} ${meses === 1 ? 'mês' : 'meses'}`;

  const resto = meses - 12;
  if (resto === 0) return '1 ano';
  return `1 ano e ${resto} ${resto === 1 ? 'mês' : 'meses'}`;
}

// ---------------------------------------------------------------------------
// Peso e altura
// ---------------------------------------------------------------------------

/**
 * "68,5" -> 68.5. Devolve null para qualquer coisa que nao seja numero
 * finito e positivo — nunca NaN, que passaria pelo JSON e viraria erro do
 * servidor em vez de erro de campo.
 */
export function numeroDigitado(texto: string): number | null {
  const limpo = texto.trim().replace(',', '.');
  if (limpo === '') return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** "1,70" (metros) -> 170 (centimetros inteiros). */
export function alturaParaCm(texto: string): number | null {
  const metros = numeroDigitado(texto);
  if (metros == null) return null;
  return Math.round(metros * 100);
}

/** 170 -> "1,70", para preencher o campo na edicao. */
export function cmParaAltura(cm: number | null | undefined): string {
  if (cm == null) return '';
  return (cm / 100).toFixed(2).replace('.', ',');
}

/** 68.5 -> "68,5"; 68 -> "68". */
export function pesoTexto(kg: number | null | undefined): string {
  if (kg == null) return '';
  return String(kg).replace('.', ',');
}
