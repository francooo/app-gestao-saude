import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, asc, desc, eq, sql } from 'drizzle-orm';

import { API_ERROR, doseInputSchema, medicationPatchSchema } from '../../src/contracts';
import { db } from '../../src/db/client';
import {
  medicationDoses,
  medicationTimes,
  medications,
  professionals,
  profiles,
} from '../../src/db/schema';
import { requireAuth } from '../../src/lib/auth';
import { fail, json, parseBody, withErrorHandling } from '../../src/lib/http';
import { doseDaConta, medicamentoDaConta } from '../../src/lib/ownership';
import { validarPosologia } from '../../src/lib/posologia';
import { horaCurta, serializarDose, serializarMedicamento } from '../../src/lib/serialize';

/** Quantas doses do historico a tela de detalhe mostra. */
const HISTORICO = 30;

/**
 * Um medicamento e suas doses.
 *
 * O POST aqui registra uma DOSE deste medicamento, e nao outro medicamento:
 * POST numa colecao cria um item, POST num item acrescenta algo a ele. Isso
 * existe por escolha, nao por preguica — o plano Hobby da Vercel aceita 12
 * funcoes e um deploy que estoura falha EM SILENCIO (o build passa, nada sobe).
 * Um arquivo api/doses.ts separado nao compraria nada: o medicationId viria no
 * corpo e o handler faria exatamente a mesma checagem de dono.
 */
export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  const id = typeof req.query.id === 'string' ? req.query.id : null;
  if (!id) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  // Passa pelo join com profiles: remedio de outra conta responde 404.
  const atual = await medicamentoDaConta(id, auth.userId);
  if (!atual) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  if (req.method === 'GET') return detalhar(res, id);
  if (req.method === 'POST') return registrarDose(req, res, atual, auth.userId);
  if (req.method === 'PATCH') return atualizar(req, res, atual, auth.userId);

  if (req.method === 'DELETE') {
    // O mesmo verbo serve duas coisas: sem doseId apaga o remedio, com doseId
    // desfaz uma dose. E a unica sobrecarga do desenho, e cabe em tres linhas.
    const doseId = typeof req.query.doseId === 'string' ? req.query.doseId : null;
    return doseId ? desfazerDose(res, doseId, id, auth.userId) : remover(res, id);
  }

  res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
  return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
});

/**
 * Monta o medicamento com horarios e historico, no formato da listagem.
 *
 * OS JOINS NAO SAO ENFEITE. Sem eles esta funcao devolvia so as colunas de
 * `medications`, e a tela de detalhe quebrava em tres lugares de uma vez:
 * o circulo colorido da pessoa virava "?", a linha "Receitado por" nunca
 * aparecia, e — o pior — como `atualizar()` tambem devolve daqui, encerrar um
 * tratamento trocava o avatar correto por "?" na frente do usuario.
 *
 * O leftJoin em professionals e obrigatorio: com innerJoin, todo remedio sem
 * prescritor sumiria da resposta.
 */
async function montar(id: string) {
  const [linha] = await db
    .select({
      medicamento: medications,
      profileName: profiles.fullName,
      profileColor: profiles.avatarColor,
      prescriberName: professionals.name,
    })
    .from(medications)
    .innerJoin(profiles, eq(profiles.id, medications.profileId))
    .leftJoin(professionals, eq(professionals.id, medications.prescriberId))
    .where(eq(medications.id, id))
    .limit(1);

  if (!linha) return null;

  const [horarios, doses] = await Promise.all([
    db
      .select()
      .from(medicationTimes)
      .where(eq(medicationTimes.medicationId, id))
      .orderBy(asc(medicationTimes.timeOfDay)),
    db
      .select()
      .from(medicationDoses)
      .where(eq(medicationDoses.medicationId, id))
      .orderBy(desc(medicationDoses.takenAt))
      .limit(HISTORICO),
  ]);

  return {
    ...serializarMedicamento(linha.medicamento),
    profileName: linha.profileName,
    profileColor: linha.profileColor,
    prescriberName: linha.prescriberName,
    times: horarios.map((h) => horaCurta(h.timeOfDay)),
    doses: doses.map(serializarDose),
    lastDoseAt: doses.find((d) => d.status === 'tomada')?.takenAt ?? null,
  };
}

async function detalhar(res: VercelResponse, id: string) {
  const medication = await montar(id);
  if (!medication) return fail(res, 404, API_ERROR.INTERNAL_ERROR);
  return json(res, 200, { medication });
}

async function atualizar(
  req: VercelRequest,
  res: VercelResponse,
  atual: typeof medications.$inferSelect,
  userId: string,
) {
  const body = parseBody(res, medicationPatchSchema, req.body);
  if (!body) return;

  if (body.prescriberId) {
    const [prof] = await db
      .select({ id: professionals.id })
      .from(professionals)
      .where(and(eq(professionals.id, body.prescriberId), eq(professionals.userId, userId)))
      .limit(1);

    if (!prof) return fail(res, 404, API_ERROR.INTERNAL_ERROR);
  }

  // Os horarios atuais sao necessarios para validar um PATCH que muda o tipo
  // de agendamento sem reenviar os horarios.
  const horariosAtuais = await db
    .select()
    .from(medicationTimes)
    .where(eq(medicationTimes.medicationId, atual.id));

  // A regra so pode ser avaliada sobre o resultado da mesclagem: quem manda so
  // { name } nao deveria ser obrigado a reenviar o intervalo.
  const erros = validarPosologia({
    scheduleType: body.scheduleType ?? atual.scheduleType,
    intervalHours: body.intervalHours !== undefined ? body.intervalHours : atual.intervalHours,
    times: body.times ?? horariosAtuais.map((h) => horaCurta(h.timeOfDay)),
    startsAt: body.startsAt !== undefined ? body.startsAt : atual.startsAt,
    endsAt: body.endsAt !== undefined ? body.endsAt : atual.endsAt,
  });
  if (erros) return fail(res, 400, API_ERROR.VALIDATION_ERROR, erros);

  // updatedAt e manual: nao ha trigger no banco.
  const mudancas: Partial<typeof medications.$inferInsert> = { updatedAt: new Date() };

  if (body.name !== undefined) mudancas.name = body.name;
  if (body.strength !== undefined) mudancas.strength = body.strength;
  if (body.form !== undefined) mudancas.form = body.form;
  if (body.doseAmount !== undefined) {
    mudancas.doseAmount = body.doseAmount == null ? null : String(body.doseAmount);
  }
  if (body.doseUnit !== undefined) mudancas.doseUnit = body.doseUnit;
  if (body.scheduleType !== undefined) mudancas.scheduleType = body.scheduleType;
  if (body.intervalHours !== undefined) mudancas.intervalHours = body.intervalHours;
  if (body.startsAt !== undefined) mudancas.startsAt = body.startsAt ? new Date(body.startsAt) : null;
  if (body.endsAt !== undefined) mudancas.endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if (body.instructions !== undefined) mudancas.instructions = body.instructions;
  if (body.prescriberId !== undefined) mudancas.prescriberId = body.prescriberId;
  if (body.isActive !== undefined) mudancas.isActive = body.isActive;

  // profileId nao existe no schema do PATCH, entao quem mandar tem o campo
  // ignorado — que e o comportamento correto: mover o remedio de perfil
  // deixaria o historico de doses apontando para a pessoa errada.
  await db.transaction(async (tx) => {
    await tx.update(medications).set(mudancas).where(eq(medications.id, atual.id));

    // `times` tem semantica de substituicao total.
    if (body.times !== undefined) {
      await tx.delete(medicationTimes).where(eq(medicationTimes.medicationId, atual.id));
      if (body.times.length > 0) {
        await tx
          .insert(medicationTimes)
          .values(body.times.map((t) => ({ medicationId: atual.id, timeOfDay: `${t}:00` })));
      }
    }
  });

  return json(res, 200, { medication: await montar(atual.id) });
}

async function remover(res: VercelResponse, id: string) {
  // A cascata leva horarios e TODO o historico de doses junto. Por isso a tela
  // oferece "Encerrar tratamento" (isActive: false) como acao primaria, e
  // deixa isto atras de uma segunda confirmacao que diz a consequencia.
  await db.delete(medications).where(eq(medications.id, id));
  res.status(204).end();
}

async function registrarDose(
  req: VercelRequest,
  res: VercelResponse,
  medicamento: typeof medications.$inferSelect,
  userId: string,
) {
  const body = parseBody(res, doseInputSchema, req.body);
  if (!body) return;

  const valores = {
    medicationId: medicamento.id,
    // O perfil sai do MEDICAMENTO, nunca do corpo: aceitar do cliente deixaria
    // registrar dose no perfil alheio.
    profileId: medicamento.profileId,
    scheduledFor: body.scheduledFor ? new Date(body.scheduledFor) : null,
    takenAt: body.takenAt ? new Date(body.takenAt) : new Date(),
    status: body.status,
    amount: body.amount == null ? medicamento.doseAmount : String(body.amount),
    notes: body.notes ?? null,
    recordedBy: userId,
  };

  // Sem horario agendado ('as_needed'), cada registro e uma dose real: duas
  // dipironas no mesmo dia sao duas doses, nao duplicata.
  if (!valores.scheduledFor) {
    const [criada] = await db.insert(medicationDoses).values(valores).returning();
    return json(res, 201, { dose: serializarDose(criada!) });
  }

  // Com horario, o indice unico parcial medication_doses_slot_unique_idx torna
  // isto idempotente de verdade — e nao por checar antes, que perderia a
  // corrida entre dois cuidadores marcando a mesma dose ao mesmo tempo.
  const [dose] = await db
    .insert(medicationDoses)
    .values(valores)
    .onConflictDoUpdate({
      target: [medicationDoses.medicationId, medicationDoses.scheduledFor],
      // O indice e PARCIAL, e o ON CONFLICT precisa repetir o mesmo predicado
      // — senao o Postgres nao casa o indice e devolve 42P10 ("no unique or
      // exclusion constraint matching the ON CONFLICT specification"), que
      // chega na tela como 500.
      targetWhere: sql`${medicationDoses.scheduledFor} IS NOT NULL`,
      set: {
        takenAt: valores.takenAt,
        status: valores.status,
        amount: valores.amount,
        notes: valores.notes,
        recordedBy: valores.recordedBy,
      },
    })
    .returning();

  return json(res, 200, { dose: serializarDose(dose!) });
}

async function desfazerDose(
  res: VercelResponse,
  doseId: string,
  medicationId: string,
  userId: string,
) {
  const dose = await doseDaConta(doseId, userId);
  // Conferir o vinculo evita apagar a dose de outro remedio da mesma conta por
  // um id trocado na URL.
  if (!dose || dose.medicationId !== medicationId) {
    return fail(res, 404, API_ERROR.INTERNAL_ERROR);
  }

  await db.delete(medicationDoses).where(eq(medicationDoses.id, doseId));
  res.status(204).end();
}
