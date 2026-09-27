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

// ---------------------------------------------------------------------------
// Estado de "lido" dos avisos
//
// Hibrido de proposito, e o carimbo e a coluna vertebral:
//
//     lido = idsLidos.has(id)  ||  surgiuEm <= lidoAte
//
// O carimbo sozinho nao serve porque um aviso pode ser marcado individualmente
// e outro, mais antigo, continuar nao lido. A lista sozinha tambem nao: o
// expo-secure-store tem teto de ~2048 bytes POR CHAVE, e uma lista de ids
// lidos cresceria sem fim.
// ---------------------------------------------------------------------------

const AVISOS_LIDOS_ATE = 'pref_avisos_lidos_ate';
const AVISOS_LIDOS_IDS = 'pref_avisos_lidos_ids';

/**
 * Quantos ids individuais cabem.
 *
 * A conta, para o id mais longo: "dose-atrasada:" (14) + uuid (36) + ":" (1) +
 * data local ISO (25) + quebra de linha = 77 bytes. 24 x 77 = 1 848, sob os
 * ~2048 do armazenamento; 30 dariam 2 310 e estourariam.
 *
 * Fila: ao encher, o mais antigo cai. Quem marca 25 avisos um a um sem usar
 * "marcar todas" e um caso que nao existe num aplicativo cujo estado normal e
 * lista vazia — e o que cai do fim provavelmente nem e mais calculavel.
 */
const MAXIMO_DE_IDS = 24;

/** Nulo quando nunca se marcou tudo como lido. */
export async function avisosLidosAte(): Promise<string | null> {
  return ler(AVISOS_LIDOS_ATE);
}

/**
 * Marca tudo que ja surgiu como lido.
 *
 * Limpa a lista de ids junto: com o carimbo cobrindo todos os avisos
 * correntes, manter os ids seria gastar os 2 KB a toa.
 */
export async function definirAvisosLidosAte(instanteISO: string): Promise<void> {
  await gravar(AVISOS_LIDOS_ATE, instanteISO);
  await gravar(AVISOS_LIDOS_IDS, '');
}

export async function idsDeAvisosLidos(): Promise<Set<string>> {
  const bruto = (await ler(AVISOS_LIDOS_IDS)) ?? '';
  // Separado por quebra de linha, e nao JSON: id nao tem quebra de linha
  // dentro, entao o formato mais barato serve e nao ha parse para falhar.
  return new Set(bruto.split('\n').filter(Boolean));
}

export async function marcarAvisoComoLido(id: string): Promise<void> {
  const atuais = [...(await idsDeAvisosLidos())].filter((x) => x !== id);
  atuais.push(id);

  const podados = atuais.slice(-MAXIMO_DE_IDS);
  await gravar(AVISOS_LIDOS_IDS, podados.join('\n'));
}
