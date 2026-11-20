import type { Acompanhante } from '@gestao/shared/api/acompanhantes';
import type { Appointment, Medication } from '@gestao/shared/api/health';
import { estoqueBaixo } from '@gestao/shared/lib/estoque';
import { hora, proximaDose, tituloDoMedicamento } from '@gestao/shared/lib/posologia';
import { addDays, differenceInCalendarDays, isSameDay } from 'date-fns';

/**
 * "Sua próxima jornada de cuidado" (mock 01 da repaginacao): quatro passos em
 * linha — a proxima dose, a proxima consulta, a renovacao (fim de tratamento
 * ou estoque acabando) e o proximo lembrete ao acompanhante.
 *
 * Tudo DERIVADO do que a tela ja carregou; nada novo no banco. Passo sem dado
 * nao some: mostra "Em breve" e um traco, como no mock — a linha do tempo
 * ensina o que o sistema acompanha mesmo quando ainda nao ha nada.
 */
export type Passo = {
  chave: 'dose' | 'consulta' | 'renovacao' | 'acompanhante';
  icone: string;
  /** "Hoje", "Amanhã", "Em 3 dias", "Em breve". */
  quando: string;
  titulo: string;
  detalhe: string;
  /** Passo com dado leva a tela dele. */
  para?: string;
  /** O passo mais proximo ganha destaque (ladrilho verde cheio). */
  destaque?: boolean;
};

const DIAS_DE_RENOVACAO = 7;

function relativo(d: Date, agora: Date): string {
  const dias = differenceInCalendarDays(d, agora);
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Amanhã';
  if (dias < 7) return `Em ${dias} dias`;
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}

export function passosDaJornada(p: {
  remedios: Medication[];
  consultas: Appointment[];
  acompanhantes: Acompanhante[];
  agora: Date;
  /** null = a familia toda. */
  pessoaId: string | null;
}): Passo[] {
  const { agora } = p;
  const meus = p.remedios.filter((m) => m.isActive && (p.pessoaId ? m.profileId === p.pessoaId : true));

  // 1. Proxima dose.
  let dose: { m: Medication; quando: Date } | null = null;
  for (const m of meus) {
    const q = proximaDose(m, agora);
    if (q && (!dose || q < dose.quando)) dose = { m, quando: q };
  }

  // 2. Proxima consulta.
  const consulta = p.consultas
    .filter((c) => (p.pessoaId ? c.profileId === p.pessoaId : true))
    .find((c) => new Date(c.scheduledAt) >= agora);

  // 3. Renovacao: fim de tratamento nos proximos dias, ou estoque acabando.
  const limite = addDays(agora, DIAS_DE_RENOVACAO);
  const terminando = meus
    .filter((m) => m.endsAt && new Date(m.endsAt) >= agora && new Date(m.endsAt) <= limite)
    .sort((a, b) => a.endsAt!.localeCompare(b.endsAt!))[0];
  const acabando = terminando ? null : meus.find((m) => m.stock && estoqueBaixo(m, m.stock));

  // 4. Lembrete ao acompanhante: quem recebe o aviso da proxima dose.
  const quemAvisa = dose
    ? p.acompanhantes.find((a) => a.active && a.notifyDose && a.profileId === dose!.m.profileId)
    : undefined;

  return [
    dose
      ? {
          chave: 'dose',
          icone: 'mci:pill',
          quando: isSameDay(dose.quando, agora) ? 'Hoje' : relativo(dose.quando, agora),
          titulo: tituloDoMedicamento(dose.m),
          detalhe: hora(dose.quando),
          para: `/remedios/${dose.m.id}`,
          destaque: true,
        }
      : { chave: 'dose', icone: 'mci:pill', quando: 'Em breve', titulo: 'Próxima dose', detalhe: '—' },
    consulta
      ? {
          chave: 'consulta',
          icone: 'calendar',
          quando: relativo(new Date(consulta.scheduledAt), agora),
          titulo: consulta.professionalName ?? consulta.title ?? 'Consulta médica',
          detalhe: hora(new Date(consulta.scheduledAt)),
          para: consulta.professionalId ? `/medico/${consulta.professionalId}` : '/medicos',
        }
      : { chave: 'consulta', icone: 'calendar', quando: 'Em breve', titulo: 'Consulta médica', detalhe: '—' },
    terminando
      ? {
          chave: 'renovacao',
          icone: 'file-text',
          quando: relativo(new Date(terminando.endsAt!), agora),
          titulo: 'Fim do tratamento',
          detalhe: tituloDoMedicamento(terminando),
          para: `/remedios/${terminando.id}`,
        }
      : acabando
        ? {
            chave: 'renovacao',
            icone: 'file-text',
            quando: 'Em breve',
            titulo: 'Renovar receita',
            detalhe: `${tituloDoMedicamento(acabando)} está acabando`,
            para: '/remedios/estoque',
          }
        : { chave: 'renovacao', icone: 'file-text', quando: 'Em breve', titulo: 'Renovação de receita', detalhe: '—' },
    quemAvisa && dose
      ? {
          chave: 'acompanhante',
          icone: 'heart',
          quando: isSameDay(dose.quando, agora) ? 'Hoje' : relativo(dose.quando, agora),
          titulo: `Lembrete para ${quemAvisa.fullName.split(/\s+/)[0]}`,
          detalhe: `Pelo WhatsApp, ${hora(dose.quando)}`,
          para: '/conta/whatsapp',
        }
      : {
          chave: 'acompanhante',
          icone: 'heart',
          quando: 'Em breve',
          titulo: 'Acompanhamento familiar',
          detalhe: '—',
          para: '/conta/whatsapp',
        },
  ];
}
