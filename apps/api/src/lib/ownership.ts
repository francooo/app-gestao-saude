import { and, eq } from 'drizzle-orm';

import { db } from '../db/client';
import { appointments, profiles } from '../db/schema';

/**
 * Verificacoes de dono para o dominio de saude.
 *
 * A sutileza que estas funcoes existem para resolver: `appointments` aponta
 * para `profiles`, e nao para `users`. Filtrar apenas pelo id da consulta
 * deixaria alguem ler, editar ou criar consulta no perfil de outra conta —
 * o vinculo com o dono so aparece depois do join.
 *
 * Todas retornam null quando nao pertence a conta, e o handler responde 404.
 * Nunca 403: um 403 ja confirmaria que o registro existe.
 */

/** Confirma que o perfil e da conta. */
export async function perfilDaConta(profileId: string, userId: string): Promise<string | null> {
  const [perfil] = await db
    .select({ id: profiles.id })
    .from(profiles)
    .where(and(eq(profiles.id, profileId), eq(profiles.userId, userId)))
    .limit(1);

  return perfil?.id ?? null;
}

/** Confirma que a consulta pertence a um perfil da conta. */
export async function consultaDaConta(appointmentId: string, userId: string) {
  const [linha] = await db
    .select({ consulta: appointments })
    .from(appointments)
    .innerJoin(profiles, eq(profiles.id, appointments.profileId))
    .where(and(eq(appointments.id, appointmentId), eq(profiles.userId, userId)))
    .limit(1);

  return linha?.consulta ?? null;
}
