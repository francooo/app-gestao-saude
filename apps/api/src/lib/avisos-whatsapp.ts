import { and, eq } from 'drizzle-orm';

import { db } from '../db/client';
import { caregivers, medications, profiles, users, whatsappSends } from '../db/schema';
import { FUSO_PADRAO, fusoValido, partesLocais } from './grade-de-doses';
import { textoDeTomado } from './mensagens-whatsapp';
import { enviarTexto } from './whatsapp';

export type TipoDeAviso = 'convite' | 'dose' | 'atraso' | 'tomado' | 'estoque';

/**
 * Registra e manda UMA mensagem — nessa ordem.
 *
 * A linha em whatsapp_sends nasce ANTES do envio, e o indice unico (acompanhante,
 * remedio, tipo, horario) faz uma segunda execucao do agendador desistir em vez
 * de mandar a mesma dose duas vezes. Se o envio falhar, a linha fica como
 * 'falha' e NAO e reenviada: um lembrete das 08:00 chegando as 08:07 por
 * retentativa confunde mais do que ajuda.
 */
export async function enviarRegistrado(p: {
  caregiverId: string;
  medicationId: string | null;
  kind: TipoDeAviso;
  slot: Date | null;
  telefone: string;
  texto: string;
}): Promise<'enviada' | 'duplicada' | 'falha'> {
  const [linha] = await db
    .insert(whatsappSends)
    .values({
      caregiverId: p.caregiverId,
      medicationId: p.medicationId,
      kind: p.kind,
      slot: p.slot,
    })
    .onConflictDoNothing()
    .returning({ id: whatsappSends.id });

  if (!linha) return 'duplicada';

  const r = await enviarTexto(p.telefone, p.texto);
  await db
    .update(whatsappSends)
    .set({ status: r.ok ? 'enviada' : 'falha', error: r.ok ? null : r.motivo })
    .where(eq(whatsappSends.id, linha.id));
  return r.ok ? 'enviada' : 'falha';
}

/** "08:00" na hora de parede da familia. */
export function horaLocal(ms: number, fuso: string): string {
  const p = partesLocais(ms, fuso);
  return `${String(p.hora).padStart(2, '0')}:${String(p.minuto).padStart(2, '0')}`;
}

export function nomeDoRemedio(m: { name: string; strength: string | null }): string {
  return [m.name, m.strength].filter(Boolean).join(' ');
}

export function fusoOuPadrao(fuso: string | null | undefined): string {
  return fuso && fusoValido(fuso) ? fuso : FUSO_PADRAO;
}

/**
 * "Fulana tomou Amoxicilina as 14:02" para quem pediu esse aviso.
 *
 * Chamado depois de a dose ser GRAVADA, e com cuidado para nunca derrubar o
 * registro: quem chama nao espera mais que alguns segundos e engole qualquer
 * erro. A dose tomada vale mais que a mensagem sobre ela.
 */
export async function avisarDoseTomada(medicationId: string, takenAt: Date): Promise<void> {
  const [linha] = await db
    .select({
      remedio: medications,
      paciente: profiles.fullName,
      fuso: users.timezone,
    })
    .from(medications)
    .innerJoin(profiles, eq(profiles.id, medications.profileId))
    .innerJoin(users, eq(users.id, profiles.userId))
    .where(eq(medications.id, medicationId))
    .limit(1);
  if (!linha) return;

  const quem = await db
    .select()
    .from(caregivers)
    .where(
      and(
        eq(caregivers.profileId, linha.remedio.profileId),
        eq(caregivers.active, true),
        eq(caregivers.notifyTaken, true),
      ),
    );
  if (quem.length === 0) return;

  const fuso = fusoOuPadrao(linha.fuso);
  const texto = textoDeTomado({
    paciente: linha.paciente,
    remedio: nomeDoRemedio(linha.remedio),
    hora: horaLocal(takenAt.getTime(), fuso),
  });

  await Promise.all(
    quem.map((c) =>
      enviarRegistrado({
        caregiverId: c.id,
        medicationId,
        kind: 'tomado',
        // A hora da tomada e a chave: marcar de novo a mesma dose nao reenvia.
        slot: takenAt,
        telefone: c.phone,
        texto,
      }),
    ),
  );
}
