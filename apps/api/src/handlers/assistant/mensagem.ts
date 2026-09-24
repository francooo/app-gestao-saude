import type { VercelRequest, VercelResponse } from '@vercel/node';
import { and, desc, eq, gte, sql } from 'drizzle-orm';

import {
  API_ERROR,
  assistantAskSchema,
  BUSCAS_POR_DIA,
  PERGUNTAS_POR_DIA,
} from '../../contracts';
import { db } from '../../db/client';
import { assistantConversations, assistantMessages } from '../../db/schema';
import { requireAuth } from '../../lib/auth';
import { rodarLaco } from '../../lib/assistente-laco';
import { montarPromptDeSistema } from '../../lib/assistente-prompt';
import type { MensagemGroq } from '../../lib/groq';
import { fail, json, parseBody, requireMethod, withErrorHandling } from '../../lib/http';
import { perfilDaConta } from '../../lib/ownership';

/** Quantas mensagens anteriores acompanham a pergunta. */
const HISTORICO_NO_PROMPT = 10;

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  if (!requireMethod(req, res, 'POST')) return;

  const auth = await requireAuth(req, res);
  if (!auth) return;

  const body = parseBody(res, assistantAskSchema, req.body);
  if (!body) return;

  // Perfil de outra conta responde 404, nunca 403 — o padrao do projeto.
  if (body.profileId) {
    const perfil = await perfilDaConta(body.profileId, auth.userId);
    if (!perfil) return fail(res, 404, API_ERROR.INTERNAL_ERROR);
  }

  if (await passouDoLimiteDiario(auth.userId)) {
    return fail(res, 429, API_ERROR.ASSISTANT_LIMIT_REACHED);
  }

  const conversa = await conversaDe(auth.userId, body.profileId ?? null);
  const anteriores = await ultimasMensagens(conversa, HISTORICO_NO_PROMPT);

  // Esgotado o teto de buscas, o assistente NAO falha: perde a internet pelo
  // resto do dia e segue respondendo com o cadastro e com o que ja sabe.
  const podeBuscar = !(await passouDoLimiteDeBuscas(auth.userId));

  const mensagens: MensagemGroq[] = [
    {
      role: 'system',
      content: montarPromptDeSistema({
        contexto: body.context,
        agora: body.agora,
        fusoHorario: body.fusoHorario,
        podeBuscar,
      }),
    },
    ...anteriores.map((m) => ({ role: m.role, content: m.content }) as MensagemGroq),
    { role: 'user', content: body.question },
  ];

  // Marcado ANTES da chamada: e quando a pessoa perguntou, de verdade.
  const perguntadoEm = new Date();

  const resposta = await rodarLaco({ mensagens, userId: auth.userId, podeBuscar });

  if (!resposta.ok) {
    // A pergunta NAO e gravada quando nao ha resposta: uma conversa com
    // pergunta solta no fim faria o proximo prompt parecer que o assistente
    // ignorou o usuario.
    //
    // Prazo estourado tem codigo proprio porque a acao util e outra: nao e
    // "tente de novo", e "pergunte de forma mais especifica".
    if (resposta.motivo === 'tempo') return fail(res, 504, API_ERROR.ASSISTANT_TIMEOUT);
    // 503 e nao 502: o servico existe e esta saudavel, so esta ocupado agora.
    if (resposta.motivo === 'limite') return fail(res, 503, API_ERROR.ASSISTANT_BUSY);
    return fail(res, 502, API_ERROR.INTERNAL_ERROR);
  }

  // As duas mensagens entram juntas, para nunca sobrar meia troca no banco.
  const gravadas = await db.transaction(async (tx) => {
    const linhas = await tx
      .insert(assistantMessages)
      .values([
        {
          conversationId: conversa,
          role: 'user',
          content: body.question,
          createdAt: perguntadoEm,
        },
        {
          conversationId: conversa,
          role: 'assistant',
          content: resposta.texto,
          // Guardar o modelo e o minimo para investigar depois uma resposta
          // problematica — o comentario do schema pede isso.
          model: resposta.modelo,
          /**
           * Como esta resposta foi construida: rodadas, ferramentas chamadas e
           * se houve busca na internet.
           *
           * Deixou de ser opcional quando o escopo abriu. Se um dia alguem
           * disser "o aplicativo mandou dar 10 ml", a unica pergunta que
           * importa e de onde saiu o numero — do cadastro, de uma pagina, ou
           * do proprio modelo. Sem isto nao ha como responder.
           */
          toolTrace: resposta.rastro,
          /**
           * O horario e EXPLICITO nos dois, e nao o defaultNow().
           *
           * O default do Postgres resolve para o horario da TRANSACAO, que e
           * constante dentro dela: as duas mensagens gravavam no mesmo
           * instante e a ordem do par ficava indefinida. Na pratica saiu
           * invertida — a resposta antes da pergunta, tanto na tela quanto no
           * historico que alimenta o proximo prompt.
           */
          createdAt: new Date(),
        },
      ])
      .returning();

    await tx
      .update(assistantConversations)
      .set({ updatedAt: new Date() })
      .where(eq(assistantConversations.id, conversa));

    return linhas;
  });

  json(res, 201, { messages: gravadas });
});

/**
 * Uma conversa por (conta, pessoa).
 *
 * O mockup nao tem lista de conversas, entao nao ha por que inventar uma. O
 * `is null` explicito e necessario: `eq(coluna, null)` vira `= NULL`, que em
 * SQL nunca casa, e cada pergunta geral abriria uma conversa nova.
 */
async function conversaDe(userId: string, profileId: string | null): Promise<string> {
  const filtro = profileId
    ? and(
        eq(assistantConversations.userId, userId),
        eq(assistantConversations.profileId, profileId),
      )
    : and(
        eq(assistantConversations.userId, userId),
        sql`${assistantConversations.profileId} IS NULL`,
      );

  const [existente] = await db
    .select({ id: assistantConversations.id })
    .from(assistantConversations)
    .where(filtro)
    .orderBy(desc(assistantConversations.updatedAt))
    .limit(1);

  if (existente) return existente.id;

  const [nova] = await db
    .insert(assistantConversations)
    .values({ userId, profileId })
    .returning({ id: assistantConversations.id });

  return nova!.id;
}

async function ultimasMensagens(conversationId: string, quantas: number) {
  const linhas = await db
    .select({ role: assistantMessages.role, content: assistantMessages.content })
    .from(assistantMessages)
    .where(eq(assistantMessages.conversationId, conversationId))
    .orderBy(desc(assistantMessages.createdAt))
    .limit(quantas);

  // Vieram do mais novo para o mais velho; o prompt precisa da ordem natural.
  return linhas.reverse();
}

/**
 * Teto diario de perguntas.
 *
 * Existe contra laco com defeito, nao contra custo: a pergunta sai por cerca
 * de US$ 0,0002. Conta em assistant_messages, sem tabela nova, no estilo de
 * janela deslizante do rateLimit.ts.
 */
async function passouDoLimiteDiario(userId: string): Promise<boolean> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(assistantMessages)
    .innerJoin(
      assistantConversations,
      eq(assistantConversations.id, assistantMessages.conversationId),
    )
    .where(
      and(
        eq(assistantConversations.userId, userId),
        eq(assistantMessages.role, 'user'),
        gte(assistantMessages.createdAt, desde),
      ),
    );

  return (linha?.total ?? 0) >= PERGUNTAS_POR_DIA;
}

/**
 * Teto diario de BUSCAS na internet, separado do teto de perguntas.
 *
 * Sao dois tetos porque sao duas contas diferentes: uma pergunta sem busca
 * custa cerca de US$ 0,0002, e com busca pode passar de US$ 0,01 — cinquenta
 * vezes mais. Um teto so, calibrado para o caso barato, ou seria inutil contra
 * o caro, ou estrangularia o uso normal.
 *
 * Conta pelo rastro gravado, sem tabela nova. O `->>` devolve texto, entao a
 * comparacao e com a string 'true'.
 */
async function passouDoLimiteDeBuscas(userId: string): Promise<boolean> {
  const desde = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [linha] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(assistantMessages)
    .innerJoin(
      assistantConversations,
      eq(assistantConversations.id, assistantMessages.conversationId),
    )
    .where(
      and(
        eq(assistantConversations.userId, userId),
        gte(assistantMessages.createdAt, desde),
        sql`${assistantMessages.toolTrace}->>'buscou' = 'true'`,
      ),
    );

  return (linha?.total ?? 0) >= BUSCAS_POR_DIA;
}
