/**
 * Celular brasileiro: a mascara enquanto se digita e a volta para exibicao.
 *
 * Quem valida de verdade e o servidor (normalizarTelefone em
 * apps/api/src/lib/whatsapp.ts); aqui e so forma, para a pessoa ver o numero
 * do jeito que ele aparece num cartao de visita.
 */

/**
 * "11999991234" -> "(11) 99999-1234", aos poucos.
 *
 * Fixo de 8 digitos ("(11) 3333-4444") tambem sai certo: o hifen anda uma
 * casa quando o numero tem 10 digitos. O servidor recusa fixo de qualquer
 * forma, mas a mascara nao deve mentir sobre o que foi digitado.
 */
export function formatarTelefone(valor: string): string {
  let d = valor.replace(/\D/g, '');
  // Colou com DDI ("+55 11 ..."): tira o 55 para a mascara caber.
  if (d.startsWith('55') && d.length > 11) d = d.slice(2);
  d = d.slice(0, 11);

  if (d.length === 0) return '';
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

/** "5511999991234", como o servidor guarda, -> "(11) 99999-1234". */
export function telefoneParaExibir(normalizado: string): string {
  return formatarTelefone(normalizado);
}
