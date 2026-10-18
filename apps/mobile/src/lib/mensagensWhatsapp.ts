/**
 * As previas das mensagens de WhatsApp, com as MESMAS frases do servidor.
 *
 * Copia de apps/api/src/lib/mensagens-whatsapp.ts. Nao da para importar de
 * la: o arquivo mora na API, fora do bundle do aplicativo. Se uma frase mudar
 * la, mudar aqui — a previa que promete um texto e entrega outro e pior que
 * nenhuma previa.
 *
 * Primeiro nome do paciente, nunca o completo, pelo mesmo motivo do servidor:
 * a mensagem aparece na tela de bloqueio do celular do acompanhante.
 */

import type { Permissao, Permissoes } from '@/api/acompanhantes';

export function primeiroNome(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

export function textoDoConvite(p: {
  quemConvida: string;
  paciente: string;
  avisos: string[];
}): string {
  const lista = p.avisos.length > 0 ? p.avisos.join(', ') : 'nenhum aviso por enquanto';
  return (
    `Olá! ${primeiroNome(p.quemConvida)} adicionou você como acompanhante dos cuidados de ` +
    `${primeiroNome(p.paciente)} no aplicativo de saúde da família. ` +
    `Você vai receber por aqui: ${lista}. ` +
    `Se não quiser receber, é só pedir a ${primeiroNome(p.quemConvida)} para remover você.`
  );
}

export function textoDaDose(p: { paciente: string; remedio: string; hora: string }): string {
  return `Lembrete: ${primeiroNome(p.paciente)} deve tomar ${p.remedio} às ${p.hora}.`;
}

/** Os nomes das permissoes — sao tambem os rotulos dos interruptores. */
export const NOMES_DOS_AVISOS = {
  notifyDose: 'horário dos medicamentos',
  notifyLate: 'avisos de dose atrasada',
  notifyLowStock: 'alerta de estoque baixo',
  notifyTaken: 'confirmação de medicamento tomado',
} as const satisfies Record<Permissao, string>;

/** O que entra na lista do convite, na ordem do servidor. */
export function avisosAutorizados(p: Permissoes): string[] {
  return (Object.keys(NOMES_DOS_AVISOS) as Permissao[])
    .filter((k) => p[k])
    .map((k) => NOMES_DOS_AVISOS[k]);
}

/** "horário dos medicamentos" -> "Horário dos medicamentos", para rotulo. */
export function rotuloDoAviso(k: Permissao): string {
  const t = NOMES_DOS_AVISOS[k];
  return t.charAt(0).toUpperCase() + t.slice(1);
}
