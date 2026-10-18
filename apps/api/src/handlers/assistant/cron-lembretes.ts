import { timingSafeEqual } from 'node:crypto';

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq, gte, inArray, isNotNull, lte, or } from 'drizzle-orm';

import { API_ERROR } from '../../contracts';
import { db } from '../../db/client';
import {
  caregivers,
  medicationDoses,
  medicationTimes,
  medications,
  profiles,
  users,
} from '../../db/schema';
import { enviarRegistrado, fusoOuPadrao, horaLocal, nomeDoRemedio } from '../../lib/avisos-whatsapp';
import { estoquesDe, type Estoque } from '../../lib/estoque';
import {
  diaLocal,
  dosesPorDia,
  instanteLocal,
  partesLocais,
  type RemedioDaGrade,
  slotsEntre,
} from '../../lib/grade-de-doses';
import { fail, json } from '../../lib/http';
import { textoDaDose, textoDeAtraso, textoDeEstoque } from '../../lib/mensagens-whatsapp';
import { whatsappConfigurado } from '../../lib/whatsapp';

const MINUTO = 60_000;
/**
 * O agendador externo chama a cada minuto, mas atrasa, pula e as vezes chama
 * duas vezes. Olhar 3 minutos para tras cobre um minuto perdido; o indice unico
 * de whatsapp_sends impede que a sobreposicao vire mensagem repetida.
 */
const JANELA = 3 * MINUTO;
/** Quanto depois do horario a dose sem registro vira "atrasada". */
const ATRASO = 30 * MINUTO;
/** O alerta de estoque sai uma vez por dia, entre 09:00 e 09:09 locais. */
const HORA_DO_ESTOQUE = 9;
/** Estoque baixo: acaba em ate 7 dias (mesma regra da tela de estoque). */
const DIAS_DE_ESTOQUE_BAIXO = 7;

/**
 * Lembretes por WhatsApp: doses do horario, doses atrasadas e estoque baixo.
 *
 * Chamado por um agendador EXTERNO (cron-job.org) — o cron da Vercel no plano
 * Hobby so roda uma vez por dia. Nao tem usuario logado: a protecao e o
 * `Authorization: Bearer CRON_SECRET`, comparado em tempo constante. Sem o
 * segredo, responde 404 como uma acao inexistente, para nao anunciar a rota.
 *
 * Mora no roteador do assistente pela vaga (12/12) e pelo maxDuration de 60 s.
 */
export default async function cronLembretes(req: VercelRequest, res: VercelResponse) {
  if (!segredoConfere(req.headers.authorization)) return fail(res, 404, API_ERROR.INTERNAL_ERROR);
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'GET, POST');
    return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
  }
  if (!whatsappConfigurado()) return json(res, 200, { ok: true, motivo: 'whatsapp-nao-configurado' });

  const agora = Date.now();
  const contagem = { dose: 0, atraso: 0, estoque: 0, falha: 0 };
  const somar = (tipo: 'dose' | 'atraso' | 'estoque', r: 'enviada' | 'duplicada' | 'falha') => {
    if (r === 'enviada') contagem[tipo] += 1;
    if (r === 'falha') contagem.falha += 1;
  };

  // Quem recebe alguma coisa: acompanhantes ativos de pessoas ativas.
  const acompanhantes = await db
    .select({ c: caregivers, paciente: profiles.fullName, fuso: users.timezone })
    .from(caregivers)
    .innerJoin(profiles, eq(profiles.id, caregivers.profileId))
    .innerJoin(users, eq(users.id, caregivers.userId))
    .where(and(eq(caregivers.active, true), eq(profiles.isActive, true), eq(users.isActive, true)));
  if (acompanhantes.length === 0) return json(res, 200, { ok: true, ...contagem });

  const porPerfil = new Map<string, typeof acompanhantes>();
  for (const a of acompanhantes) {
    const lista = porPerfil.get(a.c.profileId) ?? [];
    lista.push(a);
    porPerfil.set(a.c.profileId, lista);
  }

  const remedios = await db
    .select()
    .from(medications)
    .where(and(inArray(medications.profileId, [...porPerfil.keys()]), eq(medications.isActive, true)));
  if (remedios.length === 0) return json(res, 200, { ok: true, ...contagem });

  const horarios = await db
    .select()
    .from(medicationTimes)
    .where(inArray(medicationTimes.medicationId, remedios.map((m) => m.id)));
  const horasDe = new Map<string, string[]>();
  for (const h of horarios) {
    const lista = horasDe.get(h.medicationId) ?? [];
    lista.push(h.timeOfDay.slice(0, 5));
    horasDe.set(h.medicationId, lista);
  }

  // O estoque so e calculado para quem esta na janela das 09:00 — e o passo
  // caro (uma consulta por remedio), e nos outros 1430 minutos do dia sobra.
  const naHoraDoEstoque = remedios.filter((m) => {
    const fuso = fusoOuPadrao(porPerfil.get(m.profileId)![0]!.fuso);
    const p = partesLocais(agora, fuso);
    return p.hora === HORA_DO_ESTOQUE && p.minuto < 10;
  });
  const estoques = await estoquesDe(naHoraDoEstoque);

  const envios: Promise<void>[] = [];

  for (const m of remedios) {
    const quem = porPerfil.get(m.profileId)!;
    const fuso = fusoOuPadrao(quem[0]!.fuso);
    const paciente = quem[0]!.paciente;
    const remedio = nomeDoRemedio(m);
    const grade: RemedioDaGrade = {
      scheduleType: m.scheduleType,
      intervalHours: m.intervalHours,
      times: (horasDe.get(m.id) ?? []).sort(),
      dayInterval: m.dayInterval,
      weekdays: m.weekdays,
      totalDoses: m.totalDoses,
      startsAt: m.startsAt,
      endsAt: m.endsAt,
      createdAt: m.createdAt,
    };

    // 1. Hora da dose — a menos que alguem ja tenha marcado (tomou adiantado).
    const interessadosNaDose = quem.filter((x) => x.c.notifyDose);
    for (const slot of interessadosNaDose.length ? slotsEntre(grade, agora - JANELA, agora, fuso) : []) {
      if (await doseRegistrada(m.id, slot, agora)) continue;
      const texto = textoDaDose({ paciente, remedio, hora: horaLocal(slot, fuso) });
      for (const a of interessadosNaDose) {
        envios.push(
          enviarRegistrado({
            caregiverId: a.c.id,
            medicationId: m.id,
            kind: 'dose',
            slot: new Date(slot),
            telefone: a.c.phone,
            texto,
          }).then((r) => somar('dose', r)),
        );
      }
    }

    // 2. Dose sem registro 30 minutos depois.
    const interessadosNoAtraso = quem.filter((x) => x.c.notifyLate);
    if (interessadosNoAtraso.length > 0) {
      for (const slot of slotsEntre(grade, agora - ATRASO - JANELA, agora - ATRASO, fuso)) {
        if (await doseRegistrada(m.id, slot, agora)) continue;
        const texto = textoDeAtraso({ paciente, remedio, hora: horaLocal(slot, fuso) });
        for (const a of interessadosNoAtraso) {
          envios.push(
            enviarRegistrado({
              caregiverId: a.c.id,
              medicationId: m.id,
              kind: 'atraso',
              slot: new Date(slot),
              telefone: a.c.phone,
              texto,
            }).then((r) => somar('atraso', r)),
          );
        }
      }
    }

    // 3. Estoque baixo, uma vez por dia (o slot e a meia-noite local).
    const estoque = estoques.get(m.id);
    if (estoque && estoqueBaixo(estoque, grade, m.doseAmount)) {
      const meiaNoite = instanteLocal(diaLocal(agora, fuso), 0, 0, fuso);
      const texto = textoDeEstoque({ paciente, remedio, restante: restanteEmTexto(estoque, m.form) });
      for (const a of quem.filter((x) => x.c.notifyLowStock)) {
        envios.push(
          enviarRegistrado({
            caregiverId: a.c.id,
            medicationId: m.id,
            kind: 'estoque',
            slot: new Date(meiaNoite),
            telefone: a.c.phone,
            texto,
          }).then((r) => somar('estoque', r)),
        );
      }
    }
  }

  // Uma falha isolada (banco ou provedor) nao derruba as outras mensagens.
  await Promise.allSettled(envios);
  return json(res, 200, { ok: true, ...contagem });
}

function segredoConfere(cabecalho: string | undefined): boolean {
  const segredo = process.env.CRON_SECRET;
  // Sem segredo configurado a rota fica FECHADA, nunca aberta.
  if (!segredo || segredo.length < 16 || !cabecalho) return false;
  const esperado = Buffer.from(`Bearer ${segredo}`);
  const recebido = Buffer.from(cabecalho);
  return esperado.length === recebido.length && timingSafeEqual(esperado, recebido);
}

/**
 * Ja existe registro para aquele horario? Qualquer status conta — "pulada" foi
 * uma decisao de alguem, nao um esquecimento. Tambem vale uma dose tomada SEM
 * horario perto dele: quem marca pelo "tomei agora" nao deveria gerar alarme.
 */
async function doseRegistrada(medicationId: string, slot: number, agora: number): Promise<boolean> {
  const [linha] = await db
    .select({ id: medicationDoses.id })
    .from(medicationDoses)
    .where(
      and(
        eq(medicationDoses.medicationId, medicationId),
        or(
          and(
            isNotNull(medicationDoses.scheduledFor),
            gte(medicationDoses.scheduledFor, new Date(slot - MINUTO)),
            lte(medicationDoses.scheduledFor, new Date(slot + MINUTO)),
          ),
          and(
            gte(medicationDoses.takenAt, new Date(slot - 60 * MINUTO)),
            lte(medicationDoses.takenAt, new Date(agora)),
          ),
        ),
      ),
    )
    .limit(1);
  return !!linha;
}

/**
 * A mesma regra da tela (apps/mobile/src/lib/estoque.ts): acaba em ate 7 dias;
 * para "se necessario", que nao tem ritmo, sobrou 25% ou menos da ultima compra.
 */
function estoqueBaixo(e: Estoque, grade: RemedioDaGrade, doseAmount: string | null): boolean {
  if (e.remaining <= 0) return true;
  const porDia = dosesPorDia(grade) * (doseAmount != null ? Number(doseAmount) : 1);
  if (porDia > 0) return e.remaining / porDia <= DIAS_DE_ESTOQUE_BAIXO;
  return e.remaining <= e.lastPurchaseUnits * 0.25;
}

const UNIDADES: Record<string, [string, string]> = {
  capsula: ['cápsula', 'cápsulas'],
  comprimido: ['comprimido', 'comprimidos'],
  ml: ['ml', 'ml'],
  gotas: ['gota', 'gotas'],
};

function restanteEmTexto(e: Estoque, form: string | null): string {
  const [um, varios] = UNIDADES[form ?? ''] ?? ['unidade', 'unidades'];
  const n = String(e.remaining).replace('.', ',');
  return `${n} ${e.remaining === 1 ? um : varios}`;
}
