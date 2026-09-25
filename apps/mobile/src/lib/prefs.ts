import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Preferencias do APARELHO.
 *
 * Nao vao para o banco de proposito: "avisar nos horarios das doses" e uma
 * decisao de quem carrega este celular, nao da conta. Outro aparelho da mesma
 * familia tem a sua — e o rotulo na tela diz isso.
 *
 * Reusa o expo-secure-store, que ja esta no aplicativo para os tokens, em vez
 * de trazer um armazenamento novo so para um booleano. O fallback de web
 * segue o mesmo padrao de auth/tokenStorage.ts.
 */

/**
 * Chave MESTRA. Desligada, nenhum aviso e agendado — nem de dose, nem de
 * consulta.
 *
 * Os lembretes de consulta nao tinham interruptor nenhum ate agora: eram
 * reconciliados sem consultar preferencia alguma. Esta chave e o unico jeito
 * de desliga-los.
 */
const NOTIFICACOES = 'pref_notificacoes';

const LEMBRETES_DOSE = 'pref_lembretes_dose';

const web = Platform.OS === 'web';

async function ler(chave: string): Promise<string | null> {
  try {
    if (web) return globalThis.localStorage?.getItem(chave) ?? null;
    return await SecureStore.getItemAsync(chave);
  } catch {
    // Armazenamento indisponivel nao pode derrubar a tela: cai no padrao.
    return null;
  }
}

async function gravar(chave: string, valor: string): Promise<void> {
  try {
    if (web) globalThis.localStorage?.setItem(chave, valor);
    else await SecureStore.setItemAsync(chave, valor);
  } catch {
    // Idem: perder a preferencia e melhor que quebrar.
  }
}

/** Padrao LIGADO: quem instala um aplicativo de remedio espera ser avisado. */
export async function notificacoesLigadas(): Promise<boolean> {
  return (await ler(NOTIFICACOES)) !== 'false';
}

export async function definirNotificacoes(ligado: boolean): Promise<void> {
  await gravar(NOTIFICACOES, ligado ? 'true' : 'false');
}

/**
 * O efetivo: a mestra E a sub-chave.
 *
 * A assinatura nao muda, entao a tela de Remedios continua compilando e ganha
 * o comportamento certo de graca. A sub-chave NAO e apagada quando a mestra
 * desliga — quem religa recupera a preferencia de antes, e nao um padrao.
 */
export async function lembretesDeDoseLigados(): Promise<boolean> {
  if (!(await notificacoesLigadas())) return false;
  return (await ler(LEMBRETES_DOSE)) !== 'false';
}

/**
 * Lembretes de consulta seguem so a mestra.
 *
 * Nao inventamos uma sub-chave para consulta: nao ha interruptor de consulta
 * em tela nenhuma, e chave sem tela e estado morto.
 */
export async function lembretesDeConsultaLigados(): Promise<boolean> {
  return notificacoesLigadas();
}

export async function definirLembretesDeDose(ligado: boolean): Promise<void> {
  await gravar(LEMBRETES_DOSE, ligado ? 'true' : 'false');
}
