import type { VercelRequest, VercelResponse } from '@vercel/node';

import { API_ERROR, LEITURAS_DE_FOTO_POR_DIA, LEITURAS_POR_MINUTO, leituraDoVisorSchema } from '../../contracts';
import { db } from '../../db/client';
import { medicationPhotoReads } from '../../db/schema';
import { requireAuth } from '../../lib/auth';
import { consentimentoEstaAtual } from '../../lib/consentimento';
import { MODELO_DE_VISAO, perguntarAoGroq } from '../../lib/groq';
import { fail, json, parseBody, requireMethod, withErrorHandling } from '../../lib/http';
import { extrairJson } from '../../lib/leitura-de-foto';
import { perfilDaConta } from '../../lib/ownership';
import { exigirPremium } from '../../lib/plano';

import { encerrar, usoRecente } from './ler-foto';

/**
 * Le os NUMEROS do visor de um aparelho: pressao, glicemia, balanca ou
 * oximetro.
 *
 * Mesmo contrato da leitura de receita (ler-foto.ts): SO PROPOE. Nao grava a
 * medicao e nao guarda a imagem; a tela preenche os campos com o selo "da
 * foto" e quem salva e a pessoa, depois de conferir com o visor. Divide os
 * tetos de uso e o rastro de auditoria (medication_photo_reads, kind 'visor'):
 * cada foto e um dado de saude saindo do pais, venha de onde vier.
 *
 * O modelo NAO INTERPRETA: devolve os digitos que esta vendo, sem dizer se a
 * pressao esta alta. Quem interpreta e o medico.
 */

const PRAZO_DA_LEITURA_MS = 25_000;
const BRUTO_NO_RASTRO = 2_000;

const O_QUE_PROCURAR: Record<string, string> = {
  pressao:
    'É um medidor de pressão arterial. Leia a pressão SISTÓLICA (a maior, às vezes rotulada SYS), a DIASTÓLICA (a menor, DIA) e o PULSO (PUL ou bpm), se aparecer.',
  glicemia: 'É um glicosímetro. Leia a glicemia em mg/dL (o número grande do visor).',
  peso: 'É uma balança. Leia o peso em quilos (kg), com as casas decimais que aparecerem.',
  oxigenacao:
    'É um oxímetro de dedo. Leia a saturação de oxigênio (SpO2, em %) e o pulso (PR ou bpm), se aparecer.',
};

const PROMPT = `Você lê os números do visor de um aparelho de saúde doméstico, a partir de uma foto.

Regras:
- Devolva só os números que estão VISÍVEIS no visor. Se um número não estiver legível, devolva null nesse campo. Não estime, não complete, não invente.
- Não interprete os valores e não comente se estão normais.
- Ignore datas, horas, memória e outros números que não sejam a medição.
- Responda só com o JSON pedido.`;

const ESQUEMA = {
  type: 'json_schema',
  json_schema: {
    name: 'leitura_de_visor',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        sistolica: { type: ['number', 'null'] },
        diastolica: { type: ['number', 'null'] },
        pulso: { type: ['number', 'null'] },
        glicemia: { type: ['number', 'null'] },
        peso_kg: { type: ['number', 'null'] },
        spo2: { type: ['number', 'null'] },
      },
      required: ['sistolica', 'diastolica', 'pulso', 'glicemia', 'peso_kg', 'spo2'],
      additionalProperties: false,
    },
  },
} as const;

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  if (!requireMethod(req, res, 'POST')) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;
  // Recurso de IA: so com assinatura ou teste gratis vigente (lib/plano.ts).
  if (!(await exigirPremium(res, auth.userId))) return;

  const body = parseBody(res, leituraDoVisorSchema, req.body);
  if (!body) return;

  if (body.profileId) {
    const perfil = await perfilDaConta(body.profileId, auth.userId);
    if (!perfil) return fail(res, 404, API_ERROR.INTERNAL_ERROR);
  }

  // A foto vai para fora do pais: exige o aceite da politica vigente, como a
  // leitura de receita.
  if (!(await consentimentoEstaAtual(auth.userId))) {
    return fail(res, 403, API_ERROR.POLICY_REACCEPT_REQUIRED);
  }

  const uso = await usoRecente(auth.userId);
  if (uso.dia >= LEITURAS_DE_FOTO_POR_DIA) return fail(res, 429, API_ERROR.PHOTO_READ_LIMIT_REACHED);
  if (uso.minuto >= LEITURAS_POR_MINUTO) return fail(res, 503, API_ERROR.PHOTO_READ_BUSY);

  // A linha nasce antes da chamada: o que se audita e a TRANSFERENCIA.
  const [leitura] = await db
    .insert(medicationPhotoReads)
    .values({
      userId: auth.userId,
      profileId: body.profileId ?? null,
      kind: 'visor',
      model: MODELO_DE_VISAO,
      outcome: 'enviada',
    })
    .returning({ id: medicationPhotoReads.id });

  const resposta = await perguntarAoGroq(
    [
      { role: 'system', content: PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: O_QUE_PROCURAR[body.kind] ?? '' },
          { type: 'image_url', image_url: { url: body.photo } },
        ],
      },
    ],
    {
      timeoutMs: PRAZO_DA_LEITURA_MS,
      modelo: MODELO_DE_VISAO,
      esforco: 'none',
      tetoDeSaida: 200,
      formatoDeResposta: ESQUEMA,
    },
  );

  if (!resposta.ok) {
    await encerrar(leitura!.id, 'falha', null, null);
    if (resposta.motivo === 'limite') return fail(res, 503, API_ERROR.PHOTO_READ_BUSY);
    if (resposta.motivo === 'tempo') return fail(res, 504, API_ERROR.PHOTO_READ_TIMEOUT);
    return fail(res, 502, API_ERROR.PHOTO_READ_FAILED);
  }

  const bruto = resposta.mensagem.content;
  const lido = extrairJson(bruto) as Record<string, unknown> | null;
  const proposta = lido ? mapear(body.kind, lido) : null;

  // Nenhum numero do tipo pedido: melhor dizer que nao leu do que preencher
  // vazio e parecer que funcionou.
  if (!proposta) {
    await encerrar(leitura!.id, 'vazia', bruto?.slice(0, BRUTO_NO_RASTRO) ?? null, null);
    return fail(res, 422, API_ERROR.MEASUREMENT_READ_FAILED);
  }

  const corpo = { readId: leitura!.id, ...proposta };
  await encerrar(leitura!.id, 'lida', bruto?.slice(0, BRUTO_NO_RASTRO) ?? null, corpo);
  return json(res, 200, corpo);
});

/**
 * So os campos do tipo pedido, e so dentro das faixas que o diario aceita: um
 * 1208 lido de um visor riscado nao vira proposta. Inteiros onde o diario
 * pede inteiro; o peso fica com ate duas casas.
 */
function mapear(kind: string, l: Record<string, unknown>) {
  const num = (v: unknown, min: number, max: number, inteiro = true) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) return null;
    const n = inteiro ? Math.round(v) : Math.round(v * 100) / 100;
    return n >= min && n <= max ? n : null;
  };

  switch (kind) {
    case 'pressao': {
      const systolic = num(l.sistolica, 60, 260);
      const diastolic = num(l.diastolica, 30, 160);
      if (systolic == null || diastolic == null || systolic <= diastolic) return null;
      return { systolic, diastolic, pulse: num(l.pulso, 30, 220) };
    }
    case 'glicemia': {
      const glucose = num(l.glicemia, 20, 600);
      return glucose == null ? null : { glucose };
    }
    case 'peso': {
      const weightKg = num(l.peso_kg, 0.5, 300, false);
      return weightKg == null ? null : { weightKg };
    }
    case 'oxigenacao': {
      const spo2 = num(l.spo2, 50, 100);
      return spo2 == null ? null : { spo2, pulse: num(l.pulso, 30, 220) };
    }
    default:
      return null;
  }
}
