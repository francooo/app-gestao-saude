import { createHash } from 'node:crypto';

import { neon } from '@neondatabase/serverless';
import { z } from 'zod';

/**
 * Inscricao na lista de espera do lancamento.
 *
 * Unica funcao da pagina de vendas. Conecta como `site_escrita`
 * (sql/001_lista_de_espera.sql): so insere na lista e conta tentativas; nao
 * le a lista nem enxerga nada do app.
 *
 * Contrato com o formulario do index.html:
 *   POST { email, nome?, consentimento: true, empresa: "", origem? }
 *   201 { ok: true }
 *   400 { erro, campo? }   campo = 'email' | 'consentimento'
 *   429 { erro }
 *
 * E-mail repetido tambem responde 201: dizer "ja inscrito" revelaria a quem
 * quer que pergunte se um endereco esta na lista.
 */

/** Tentativas por IP na janela. Folgado para uma familia no mesmo wi-fi. */
const LIMITE = 8;
const JANELA = '1 hour';

const corpoSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254)
    .pipe(z.email({ error: 'Confira o e-mail: ele parece incompleto.' })),
  nome: z.string().trim().max(120).optional().nullable(),
  consentimento: z.literal(true, { error: 'Marque a concordância para receber o aviso.' }),
  /** Campo-armadilha: escondido de pessoas, preenchido por robos. */
  empresa: z.string().optional().nullable(),
  origem: z.string().trim().max(120).optional().nullable(),
});

function json(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

/** Hash do IP: o limite funciona sem guardar o IP de ninguem. */
function hashDoIp(request: Request): string {
  const encaminhado = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = encaminhado || request.headers.get('x-real-ip') || 'desconhecido';
  const sal = process.env.SITE_SAL ?? 'gestao-saude-site';
  return createHash('sha256').update(`${sal}:${ip}`).digest('hex');
}

export async function POST(request: Request): Promise<Response> {
  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return json(400, { erro: 'Não consegui ler o formulário. Tente de novo.' });
  }

  const lido = corpoSchema.safeParse(bruto);
  if (!lido.success) {
    const problema = lido.error.issues[0];
    const campo = problema?.path[0];
    if (campo === 'email' || campo === 'consentimento') {
      return json(400, { erro: problema!.message, campo });
    }
    return json(400, { erro: 'Confira os dados do formulário.' });
  }
  const dados = lido.data;

  // Robo preencheu a armadilha: finge que deu certo e nao grava nada.
  if (dados.empresa) return json(201, { ok: true });

  const url = process.env.DATABASE_URL;
  if (!url) return json(500, { erro: 'A inscrição está indisponível agora. Tente mais tarde.' });
  const sql = neon(url);

  try {
    const ipHash = hashDoIp(request);
    const [contagem] = (await sql.query(
      `select count(*)::int as n from site.tentativas
        where ip_hash = $1 and criado_em > now() - $2::interval`,
      [ipHash, JANELA],
    )) as { n: number }[];
    if ((contagem?.n ?? 0) >= LIMITE) {
      return json(429, { erro: 'Muitas tentativas seguidas. Tente de novo daqui a pouco.' });
    }
    await sql.query('insert into site.tentativas (ip_hash) values ($1)', [ipHash]);

    await sql.query(
      `insert into site.lista_de_espera (email, nome, consentiu_em, origem)
       values ($1, $2, now(), $3)
       on conflict (email) do nothing`,
      [dados.email, dados.nome || null, dados.origem || null],
    );
  } catch (e) {
    console.error('lista-de-espera', e);
    return json(500, { erro: 'A inscrição está indisponível agora. Tente mais tarde.' });
  }

  return json(201, { ok: true });
}

export function GET(): Response {
  return json(405, { erro: 'Use o formulário da página.' });
}
