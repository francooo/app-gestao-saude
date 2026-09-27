import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, eq, gte, sql } from 'drizzle-orm';

import {
  API_ERROR,
  LEITURAS_DE_FOTO_POR_DIA,
  LEITURAS_POR_MINUTO,
  leituraDeFotoSchema,
} from '../../contracts';
import { db } from '../../db/client';
import { medicationPhotoReads } from '../../db/schema';
import { requireAuth } from '../../lib/auth';
import { consentimentoEstaAtual } from '../../lib/consentimento';
import { MODELO_DE_VISAO, perguntarAoGroq } from '../../lib/groq';
import { extrairJson, mapearLeitura } from '../../lib/leitura-de-foto';
import { ESQUEMA_DA_LEITURA, promptDaLeitura } from '../../lib/leitura-prompt';
import { fail, json, parseBody, requireMethod, withErrorHandling } from '../../lib/http';
import { perfilDaConta } from '../../lib/ownership';

/**
 * Le a foto de uma receita ou de uma caixa e devolve os campos do cadastro.
 *
 * SO EXTRAI. Nao grava medicamento e nao guarda a imagem: quem grava e o
 * cadastro normal, depois de a pessoa revisar. Essa revisao nao e cortesia — e
 * o mecanismo de seguranca, porque o modelo corrige grafia em silencio (ver o
 * comentario em leitura-prompt.ts, com os dois casos medidos).
 *
 * MORA SOB /api/assistant e NAO E O ASSISTENTE. Duas razoes, nenhuma
 * semantica: o projeto esta em 12/12 funcoes serverless da Vercel, e essa e a
 * unica rota com maxDuration de 60 s.
 */

/**
 * Orcamento da chamada ao modelo.
 *
 * Nao sao os 45 s do laco do assistente porque AQUI NAO HA LACO: e uma chamada
 * so, que volta em segundos (0,6 a 2,7 s medidos) ou esta travada. Os 33 s que
 * sobram do maxDuration valem mais como folga para a SUBIDA da foto — ate
 * ~400 KB em rede movel — do que como paciencia com uma inferencia unica.
 */
const PRAZO_DA_LEITURA_MS = 25_000;

/** O texto cru do modelo, guardado no rastro. Cortado: rastro nao e arquivo. */
const BRUTO_NO_RASTRO = 4_000;

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  if (!requireMethod(req, res, 'POST')) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const body = parseBody(res, leituraDeFotoSchema, req.body);
  if (!body) return;

  // Perfil de outra conta responde 404, nunca 403 — o padrao do projeto.
  if (body.profileId) {
    const perfil = await perfilDaConta(body.profileId, auth.userId);
    if (!perfil) return fail(res, 404, API_ERROR.INTERNAL_ERROR);
  }

  if (!(await consentimentoEstaAtual(auth.userId))) {
    return fail(res, 403, API_ERROR.POLICY_REACCEPT_REQUIRED);
  }

  const uso = await usoRecente(auth.userId);
  if (uso.dia >= LEITURAS_DE_FOTO_POR_DIA) {
    return fail(res, 429, API_ERROR.PHOTO_READ_LIMIT_REACHED);
  }
  if (uso.minuto >= LEITURAS_POR_MINUTO) {
    // 503 e nao 429: o servico existe e esta saudavel, so esta ocupado agora —
    // mesmo raciocinio do ASSISTANT_BUSY. E a espera aqui e de segundos.
    return fail(res, 503, API_ERROR.PHOTO_READ_BUSY);
  }

  /**
   * A LINHA NASCE ANTES DA CHAMADA.
   *
   * Diverge de mensagem.ts, que so grava quando ha resposta, e a divergencia e
   * deliberada por duas razoes. O teto existe contra laco com defeito: se so o
   * sucesso contasse, um laco que sempre falha nunca bateria nele e
   * continuaria martelando o Groq. E o que a auditoria registra e A
   * TRANSFERENCIA, nao o resultado — a foto saiu do Brasil mesmo quando a
   * leitura falhou.
   */
  const [leitura] = await db
    .insert(medicationPhotoReads)
    .values({
      userId: auth.userId,
      profileId: body.profileId ?? null,
      kind: body.kind,
      model: MODELO_DE_VISAO,
      outcome: 'enviada',
    })
    .returning({ id: medicationPhotoReads.id });

  const resposta = await perguntarAoGroq(
    [
      { role: 'system', content: promptDaLeitura(body.kind) },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              body.kind === 'receita'
                ? 'Leia esta receita médica.'
                : 'Leia esta caixa de remédio.',
          },
          // `detail` fica de fora de proposito: e o unico parametro capaz de
          // tornar letra manuscrita ilegivel em silencio.
          { type: 'image_url', image_url: { url: body.photo } },
        ],
      },
    ],
    {
      timeoutMs: PRAZO_DA_LEITURA_MS,
      modelo: MODELO_DE_VISAO,
      tetoDeSaida: 900,
      formatoDeResposta: ESQUEMA_DA_LEITURA,
    },
  );

  if (!resposta.ok) {
    await encerrar(leitura!.id, 'falha', null, null);
    if (resposta.motivo === 'limite') return fail(res, 503, API_ERROR.PHOTO_READ_BUSY);
    if (resposta.motivo === 'tempo') return fail(res, 504, API_ERROR.PHOTO_READ_TIMEOUT);
    return fail(res, 502, API_ERROR.PHOTO_READ_FAILED);
  }

  const bruto = resposta.mensagem.content;

  /**
   * JSON cortado nao fecha, entao nem tentamos analisar.
   *
   * Vale mais dizer "nao consegui ler" do que devolver meia receita: uma lista
   * pela metade some com o ultimo remedio sem ninguem perceber.
   */
  if (resposta.motivoDeParada === 'length') {
    await encerrar(leitura!.id, 'falha', bruto, null);
    return fail(res, 502, API_ERROR.PHOTO_READ_FAILED);
  }

  const mapeado = await mapearLeitura(auth.userId, body.kind, extrairJson(bruto));
  if (!mapeado) {
    await encerrar(leitura!.id, 'falha', bruto, null);
    return fail(res, 502, API_ERROR.PHOTO_READ_FAILED);
  }

  const corpo = {
    readId: leitura!.id,
    kind: body.kind,
    model: resposta.modelo,
    prescriber: mapeado.prescriber,
    items: mapeado.items,
    discarded: mapeado.discarded,
  };

  /**
   * Lista vazia NAO e erro: e uma leitura correta de uma foto que nao tinha
   * remedio legivel — papel em branco, foto tremida, a parede. A tela trata
   * isso como desfecho proprio, com dicas de como fotografar melhor.
   *
   * E consome uma unidade do teto do mesmo jeito, porque o token foi gasto e a
   * foto saiu do pais.
   */
  await encerrar(leitura!.id, mapeado.items.length > 0 ? 'lida' : 'vazia', bruto, corpo);

  return json(res, 200, corpo);
});

/**
 * Fecha a linha de auditoria.
 *
 * Guarda o texto CRU do modelo junto da proposta que montamos. Sem o cru nao
 * ha como separar "o modelo errou" de "o nosso mapeador errou" — e e a mesma
 * regra do tool_trace, que tambem guarda o que foi pedido e nao o conteudo
 * lido. NUNCA guarda a imagem.
 */
async function encerrar(
  id: string,
  outcome: 'lida' | 'vazia' | 'falha',
  bruto: string | null,
  proposto: unknown,
) {
  await db
    .update(medicationPhotoReads)
    .set({
      outcome,
      proposal: { bruto: bruto?.slice(0, BRUTO_NO_RASTRO) ?? null, proposto },
    })
    .where(eq(medicationPhotoReads.id, id));
}

/**
 * Os dois tetos numa consulta so, em janela deslizante.
 *
 * Conta TODAS as linhas, inclusive as que falharam: ver o comentario do insert
 * acima. O teto por minuto e nosso e fica abaixo do que o provedor aguenta —
 * serve para dizer a verdade rapido, sem ida ao Groq, e para um cliente
 * travado parar de bater la fora.
 */
async function usoRecente(userId: string): Promise<{ dia: number; minuto: number }> {
  const agora = Date.now();
  const desdeOntem = new Date(agora - 24 * 60 * 60 * 1000);
  const desdeUmMinuto = new Date(agora - 60 * 1000);

  const [linha] = await db
    .select({
      dia: sql<number>`count(*)::int`,
      minuto: sql<number>`count(*) filter (where ${medicationPhotoReads.createdAt} >= ${desdeUmMinuto})::int`,
    })
    .from(medicationPhotoReads)
    .where(
      and(
        eq(medicationPhotoReads.userId, userId),
        gte(medicationPhotoReads.createdAt, desdeOntem),
      ),
    );

  return { dia: linha?.dia ?? 0, minuto: linha?.minuto ?? 0 };
}
