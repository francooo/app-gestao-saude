/**
 * Os textos das mensagens de WhatsApp. Num lugar so, e o app mostra as mesmas
 * frases como "previa" — se mudar aqui, mudar a copia em
 * apps/mobile/src/lib/mensagensWhatsapp.ts.
 *
 * Primeiro nome do paciente, nunca o completo: a mensagem fica na tela de
 * bloqueio do celular do acompanhante, e quanto menos dado de saude ela
 * carregar, melhor.
 */

function primeiro(nome: string): string {
  return nome.trim().split(/\s+/)[0] ?? nome;
}

export function textoDoConvite(p: {
  quemConvida: string;
  paciente: string;
  avisos: string[];
}): string {
  const lista = p.avisos.length > 0 ? p.avisos.join(', ') : 'nenhum aviso por enquanto';
  return (
    `Olá! ${primeiro(p.quemConvida)} adicionou você como acompanhante dos cuidados de ` +
    `${primeiro(p.paciente)} no aplicativo de saúde da família. ` +
    `Você vai receber por aqui: ${lista}. ` +
    `Se não quiser receber, é só pedir a ${primeiro(p.quemConvida)} para remover você.`
  );
}

export function textoDaDose(p: { paciente: string; remedio: string; hora: string }): string {
  return `Lembrete: ${primeiro(p.paciente)} deve tomar ${p.remedio} às ${p.hora}.`;
}

export function textoDeAtraso(p: { paciente: string; remedio: string; hora: string }): string {
  return (
    `Atenção: a dose de ${p.remedio} das ${p.hora} de ${primeiro(p.paciente)} ` +
    `ainda não foi marcada como tomada.`
  );
}

export function textoDeTomado(p: { paciente: string; remedio: string; hora: string }): string {
  return `${primeiro(p.paciente)} tomou ${p.remedio} às ${p.hora}.`;
}

export function textoDeEstoque(p: { paciente: string; remedio: string; restante: string }): string {
  return `O estoque de ${p.remedio} de ${primeiro(p.paciente)} está acabando: restam ${p.restante}.`;
}

/** Os nomes das permissoes, para o convite listar o que foi autorizado. */
export const NOMES_DOS_AVISOS = {
  notifyDose: 'horário dos medicamentos',
  notifyLate: 'avisos de dose atrasada',
  notifyLowStock: 'alerta de estoque baixo',
  notifyTaken: 'confirmação de medicamento tomado',
} as const;
