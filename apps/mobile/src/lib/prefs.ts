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

/** Padrao LIGADO: quem cadastra um remedio espera ser avisado. */
export async function lembretesDeDoseLigados(): Promise<boolean> {
  return (await ler(LEMBRETES_DOSE)) !== 'false';
}

export async function definirLembretesDeDose(ligado: boolean): Promise<void> {
  await gravar(LEMBRETES_DOSE, ligado ? 'true' : 'false');
}
