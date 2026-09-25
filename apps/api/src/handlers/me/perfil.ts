import type { VercelRequest, VercelResponse } from '@vercel/node';
import { count, desc, eq, inArray } from 'drizzle-orm';

import { API_ERROR, POLICY_VERSION } from '../../contracts';
import { db } from '../../db/client';
import {
  appointments,
  assistantConversations,
  consents,
  medicationAttachments,
  medicationDoses,
  medications,
  profiles,
  users,
} from '../../db/schema';
import type { AuthContext } from '../../lib/auth';
import { fail, json } from '../../lib/http';

/**
 * A conta de quem esta perguntando.
 *
 * Existe porque o aplicativo guarda `{id, email, fullName}` no armazenamento
 * seguro no login e NUNCA revalida: a rotacao de refresh token so troca os
 * tokens, de proposito. Sem esta rota, trocar o e-mail num aparelho deixaria o
 * outro mostrando o antigo ate o proximo login — que pode levar 60 dias, que e
 * o prazo do refresh token.
 *
 * A carga e minuscula de proposito: ela roda a cada abertura do aplicativo.
 * NAO devolve foto nem o perfil do titular. `profiles.photo` vai a 30 000
 * caracteres, e trafegar 22 KB numa revalidacao que precisa de tres campos
 * seria desperdicio puro — a tela de Ajustes ja pega nome e foto do titular
 * pelo `GET /api/profiles`, que ela carrega de qualquer jeito.
 */
export default async function perfil(
  req: VercelRequest,
  res: VercelResponse,
  auth: AuthContext,
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
  }

  const [u] = await db
    .select({
      id: users.id,
      email: users.email,
      fullName: users.fullName,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);

  if (!u) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  /**
   * O consentimento mais recente.
   *
   * A tabela e append-only por natureza: o historico de a quais versoes a
   * pessoa consentiu E o registro de conformidade. Reaceitar insere linha
   * nova; nada aqui faz UPDATE.
   *
   * Pode vir NULO e isso nao e caso de borda teorico — contas criadas antes
   * desta tabela, e a propria conta de teste, nao tem registro. A tela precisa
   * saber dizer "nao encontramos o seu aceite" sem quebrar.
   */
  const [consentimento] = await db
    .select({ policyVersion: consents.policyVersion, grantedAt: consents.grantedAt })
    .from(consents)
    .where(eq(consents.userId, auth.userId))
    .orderBy(desc(consents.grantedAt))
    .limit(1);

  const corpo: Record<string, unknown> = {
    user: { ...u, createdAt: u.createdAt.toISOString() },
    consent: consentimento
      ? {
          policyVersion: consentimento.policyVersion,
          grantedAt: consentimento.grantedAt.toISOString(),
          /**
           * O servidor RELATA que a versao mudou; nao bloqueia.
           *
           * Transformar isto em 403 nas outras rotas quebraria todo aplicativo
           * ja instalado que nao conhece a tela de reaceite — e `eas update`
           * nao e instantaneo. Mesmo raciocinio que deixou `agora` e
           * `fusoHorario` opcionais no contrato do assistente.
           */
          atual: consentimento.policyVersion === POLICY_VERSION,
        }
      : null,
    policyVersion: POLICY_VERSION,
  };

  // So a tela de apagar a conta pede. Cinco agregacoes nao tem por que rodar a
  // cada abertura do aplicativo.
  if (req.query.counts === 'true') corpo.counts = await contagens(auth.userId);

  return json(res, 200, corpo);
}

/**
 * O que a exclusao da conta levaria.
 *
 * "Isto apaga 4 pessoas, 312 doses e 3 receitas" e uma confirmacao melhor que
 * qualquer janela de arrependimento — e e por isso que nao existe periodo de
 * carencia: carencia significaria manter dado de saude e o CRM de um medico
 * que nunca consentiu vivos por mais trinta dias.
 *
 * Mesmo desenho da funcao `contagens` de api/profiles/[id].ts, que ja alimenta
 * a confirmacao de apagar UMA pessoa.
 */
async function contagens(userId: string) {
  // Subconsulta reusada: os perfis desta conta. O `inArray` do drizzle aceita
  // um select no lugar da lista, entao isto vira um IN (SELECT ...) e nao um
  // ida-e-volta para montar array de ids.
  const perfisDaConta = db
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.userId, userId));

  const remediosDaConta = db
    .select({ id: medications.id })
    .from(medications)
    .where(inArray(medications.profileId, perfisDaConta));

  const [[pessoas], [remedios], [doses], [receitas], [consultas], [conversas]] = await Promise.all([
    db.select({ n: count() }).from(profiles).where(eq(profiles.userId, userId)),
    db.select({ n: count() }).from(medications).where(inArray(medications.profileId, perfisDaConta)),
    db
      .select({ n: count() })
      .from(medicationDoses)
      .where(inArray(medicationDoses.profileId, perfisDaConta)),
    // Anexos passam pelos REMEDIOS da conta. Contar a tabela inteira daria o
    // numero de receitas de todo mundo — numero errado na tela que decide uma
    // exclusao irreversivel.
    db
      .select({ n: count() })
      .from(medicationAttachments)
      .where(inArray(medicationAttachments.medicationId, remediosDaConta)),
    db
      .select({ n: count() })
      .from(appointments)
      .where(inArray(appointments.profileId, perfisDaConta)),
    db
      .select({ n: count() })
      .from(assistantConversations)
      .where(eq(assistantConversations.userId, userId)),
  ]);

  return {
    profiles: pessoas?.n ?? 0,
    medications: remedios?.n ?? 0,
    doses: doses?.n ?? 0,
    prescriptions: receitas?.n ?? 0,
    appointments: consultas?.n ?? 0,
    assistantConversations: conversas?.n ?? 0,
  };
}
