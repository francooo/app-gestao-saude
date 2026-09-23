import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, asc, eq, gte, inArray, lte, max, or } from 'drizzle-orm';

import { API_ERROR, medicationInputSchema, medicationQuerySchema } from '../../src/contracts';
import { db } from '../../src/db/client';
import {
  medicationDoses,
  medicationTimes,
  medications,
  professionals,
  profiles,
} from '../../src/db/schema';
import { requireAuth } from '../../src/lib/auth';
import { fail, json, parseBody, parseQuery, withErrorHandling } from '../../src/lib/http';
import { perfilDaConta } from '../../src/lib/ownership';
import { horaCurta, serializarDose, serializarMedicamento } from '../../src/lib/serialize';
import { validarPosologia } from '../../src/lib/posologia';

/** Teto da janela. Sem ele, um bug no aplicativo baixa o historico inteiro. */
const JANELA_MAXIMA_MS = 31 * 24 * 60 * 60 * 1000;

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') return listar(req, res, auth.userId);
  if (req.method === 'POST') return criar(req, res, auth.userId);

  res.setHeader('Allow', 'GET, POST');
  return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
});

/**
 * Lista os medicamentos com tudo que a tela precisa numa resposta so.
 *
 * Sao quatro consultas montadas em JS em vez de uma com joins, porque horarios
 * e doses sao colecoes: um join unico multiplicaria as linhas e a tela teria
 * que desduplicar.
 *
 * A janela `from`/`to` vem do APLICATIVO, com offset, porque so ele sabe que
 * dia e hoje no aparelho. Ver o comentario em contracts.ts.
 */
async function listar(req: VercelRequest, res: VercelResponse, userId: string) {
  const q = parseQuery(res, medicationQuerySchema, req.query);
  if (!q) return;

  const de = new Date(q.from);
  const ate = new Date(q.to);
  if (ate <= de || ate.getTime() - de.getTime() > JANELA_MAXIMA_MS) {
    return fail(res, 400, API_ERROR.VALIDATION_ERROR, { to: 'Período inválido' });
  }

  // O join com profiles e o que garante que so venham remedios da conta.
  //
  // O filtro de isActive nao e detalhe: sem ele, remover alguem da familia
  // deixaria os remedios dessa pessoa continuarem listados — com o nome e a
  // cor dela, vindos deste mesmo join. O aplicativo diria que removeu, e a
  // tela provaria o contrario.
  const filtros = [eq(profiles.userId, userId), eq(profiles.isActive, true)];

  if (q.profileId) {
    const perfil = await perfilDaConta(q.profileId, userId);
    // Perfil de outra conta responde lista vazia, nao erro: um erro
    // distinguiria "id inexistente" de "id de outra pessoa".
    if (!perfil) return json(res, 200, { medications: [] });
    filtros.push(eq(medications.profileId, perfil));
  }

  if (q.includeInactive !== 'true') filtros.push(eq(medications.isActive, true));

  const linhas = await db
    .select({
      medicamento: medications,
      profileName: profiles.fullName,
      profileColor: profiles.avatarColor,
      prescriberName: professionals.name,
    })
    .from(medications)
    .innerJoin(profiles, eq(profiles.id, medications.profileId))
    .leftJoin(professionals, eq(professionals.id, medications.prescriberId))
    .where(and(...filtros))
    .orderBy(asc(medications.name));

  const ids = linhas.map((l) => l.medicamento.id);
  // inArray com lista vazia vira `in ()`, que e erro de sintaxe no Postgres.
  if (ids.length === 0) return json(res, 200, { medications: [] });

  const [horarios, doses, ultimas] = await Promise.all([
    db
      .select()
      .from(medicationTimes)
      .where(inArray(medicationTimes.medicationId, ids))
      .orderBy(asc(medicationTimes.timeOfDay)),

    // Pega por takenAt OU por scheduledFor: uma dose marcada com atraso tem
    // takenAt fora da janela mas pertence ao horario que esta dentro dela.
    // scheduledFor nao tem indice — irrelevante na escala de uma familia.
    db
      .select()
      .from(medicationDoses)
      .where(
        and(
          inArray(medicationDoses.medicationId, ids),
          or(
            and(gte(medicationDoses.takenAt, de), lte(medicationDoses.takenAt, ate)),
            and(gte(medicationDoses.scheduledFor, de), lte(medicationDoses.scheduledFor, ate)),
          ),
        ),
      ),

    // A ancora do proximo horario de um remedio "a cada N horas" pode estar
    // fora da janela: tomado as 22h de ontem, 12/12h, proxima as 10h de hoje.
    // Servido pelo indice medication_doses_medication_taken_idx.
    db
      .select({ medicationId: medicationDoses.medicationId, ultima: max(medicationDoses.takenAt) })
      .from(medicationDoses)
      .where(
        and(inArray(medicationDoses.medicationId, ids), eq(medicationDoses.status, 'tomada')),
      )
      .groupBy(medicationDoses.medicationId),
  ]);

  const horariosPor = new Map<string, string[]>();
  for (const h of horarios) {
    const lista = horariosPor.get(h.medicationId) ?? [];
    lista.push(horaCurta(h.timeOfDay));
    horariosPor.set(h.medicationId, lista);
  }

  const dosesPor = new Map<string, ReturnType<typeof serializarDose>[]>();
  for (const d of doses) {
    const lista = dosesPor.get(d.medicationId) ?? [];
    lista.push(serializarDose(d));
    dosesPor.set(d.medicationId, lista);
  }

  const ultimaPor = new Map(ultimas.map((u) => [u.medicationId, u.ultima]));

  json(res, 200, {
    medications: linhas.map((l) => ({
      ...serializarMedicamento(l.medicamento),
      profileName: l.profileName,
      profileColor: l.profileColor,
      prescriberName: l.prescriberName,
      times: horariosPor.get(l.medicamento.id) ?? [],
      doses: dosesPor.get(l.medicamento.id) ?? [],
      lastDoseAt: ultimaPor.get(l.medicamento.id) ?? null,
    })),
  });
}

async function criar(req: VercelRequest, res: VercelResponse, userId: string) {
  const body = parseBody(res, medicationInputSchema, req.body);
  if (!body) return;

  // Sem esta checagem, bastaria mandar o profileId de outra conta para criar
  // um remedio na agenda alheia.
  const perfil = await perfilDaConta(body.profileId, userId);
  if (!perfil) return fail(res, 404, API_ERROR.INTERNAL_ERROR);

  if (body.prescriberId) {
    const [prof] = await db
      .select({ id: professionals.id })
      .from(professionals)
      .where(and(eq(professionals.id, body.prescriberId), eq(professionals.userId, userId)))
      .limit(1);

    if (!prof) return fail(res, 404, API_ERROR.INTERNAL_ERROR);
  }

  // Espelha o CHECK medications_interval_requires_hours para o erro sair 400
  // com o campo, em vez de 500 vindo do banco.
  const erros = validarPosologia(body);
  if (erros) return fail(res, 400, API_ERROR.VALIDATION_ERROR, erros);

  const criado = await db.transaction(async (tx) => {
    const [m] = await tx
      .insert(medications)
      .values({
        profileId: perfil,
        name: body.name,
        strength: body.strength ?? null,
        form: body.form ?? null,
        // numeric exige string na escrita.
        doseAmount: body.doseAmount == null ? null : String(body.doseAmount),
        doseUnit: body.doseUnit ?? null,
        scheduleType: body.scheduleType,
        intervalHours: body.intervalHours ?? null,
        startsAt: body.startsAt ? new Date(body.startsAt) : null,
        endsAt: body.endsAt ? new Date(body.endsAt) : null,
        instructions: body.instructions ?? null,
        prescriberId: body.prescriberId ?? null,
      })
      .returning();

    if (body.times.length > 0) {
      await tx
        .insert(medicationTimes)
        .values(body.times.map((t) => ({ medicationId: m!.id, timeOfDay: `${t}:00` })));
    }

    return m!;
  });

  json(res, 201, {
    medication: {
      ...serializarMedicamento(criado),
      times: [...body.times].sort(),
      doses: [],
      lastDoseAt: null,
    },
  });
}
