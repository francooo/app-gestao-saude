import { desc, eq } from 'drizzle-orm';

import { POLICY_VERSION } from '../contracts';
import { db } from '../db/client';
import { consents } from '../db/schema';

/**
 * A conta aceitou a versao CORRENTE da politica de privacidade?
 *
 * SO A LEITURA DE FOTO CHAMA ISTO, e a assimetria e deliberada. Em todo o
 * resto do aplicativo o servidor RELATA a versao velha e deixa passar (ver
 * handlers/me/perfil.ts): transformar aquilo em 403 derrubaria todo aplicativo
 * ja instalado que nao conhece a tela de reaceite, e `eas update` nao e
 * instantaneo.
 *
 * Aqui bloquear e seguro POR UM MOTIVO QUE NAO SE REPETE: a rota e nova.
 * Nenhum bundle publicado a chama, entao nenhum 403 pode quebrar um caminho
 * que ja funcionava. Se alguem for tentado a "padronizar" e usar isto em outra
 * rota, esse motivo deixa de valer.
 *
 * E e necessario porque esta e a unica rota cuja FINALIDADE e mandar um
 * documento de saude para fora do pais — a foto de uma receita carrega o nome
 * e o CRM de um profissional que nunca consentiu com este aplicativo, e muitas
 * vezes o diagnostico. O consentimento aqui e base legal, nao formalidade.
 *
 * Sem linha nenhuma tambem e `false`: contas anteriores a esta tabela existem,
 * e "nao encontramos o seu aceite" nao autoriza a transferencia.
 */
export async function consentimentoEstaAtual(userId: string): Promise<boolean> {
  const [ultimo] = await db
    .select({ policyVersion: consents.policyVersion })
    .from(consents)
    .where(eq(consents.userId, userId))
    .orderBy(desc(consents.grantedAt))
    .limit(1);

  return ultimo?.policyVersion === POLICY_VERSION;
}
