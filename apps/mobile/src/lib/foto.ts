import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Escolha e preparo da foto do medico.
 *
 * Unico lugar do aplicativo que conhece o seletor de imagens e o manipulador;
 * o resto da base so ve um data URI pronto para enviar.
 */

/** Lado do quadrado final, em pixels. */
const LADO = 200;
/** Lado de recurso, quando nem a menor qualidade cabe no teto. */
const LADO_REDUZIDO = 150;

/**
 * Teto de caracteres do data URI.
 *
 * O contrato do servidor aceita 30 000; paramos em 24 000 para a validacao la
 * ser rede de seguranca de verdade, e nao o mecanismo que a pessoa encontra.
 */
const TETO = 24_000;

/**
 * Tentadas em ordem, da melhor para a pior. Reencodar um bitmap de 200x200 e
 * barato — o custo real foi decodificar o original, que acontece uma vez so.
 */
const QUALIDADES = [0.6, 0.45, 0.3];

export type ResultadoFoto =
  | { ok: true; dataUri: string }
  | { ok: false; motivo: 'cancelado' | 'permissao' | 'falha' };

/**
 * Abre a camera ou a galeria e devolve a foto pronta, quadrada e leve.
 *
 * Duas propriedades importantes vem de graca por passar pelo manipulador, e
 * nao valem ser perdidas numa "otimizacao" futura:
 *
 * 1. Ele rasteriza o bitmap JA ORIENTADO. Foto de retrato de iPhone, que
 *    guarda a rotacao no EXIF em vez de nos pixels, sai em pe.
 * 2. Reencodar APAGA TODO O EXIF, inclusive o GPS. Uma foto tirada no
 *    consultorio carrega a coordenada do consultorio; ela nao sobe.
 */
export async function escolherFoto(origem: 'camera' | 'galeria'): Promise<ResultadoFoto> {
  try {
    const escolha = await abrirSeletor(origem);
    if (escolha === 'permissao') return { ok: false, motivo: 'permissao' };
    if (!escolha) return { ok: false, motivo: 'cancelado' };

    const dataUri = await prepararQuadrado(escolha);
    return dataUri ? { ok: true, dataUri } : { ok: false, motivo: 'falha' };
  } catch {
    // Formato exotico, arquivo corrompido, provedor do Android que devolve
    // uma URI ilegivel. Nada disso deve derrubar a tela de cadastro.
    return { ok: false, motivo: 'falha' };
  }
}

async function abrirSeletor(origem: 'camera' | 'galeria'): Promise<string | null | 'permissao'> {
  const opcoes: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    // Conveniencia, nao garantia: no Android esta e uma tela de corte do
    // sistema que nem todo aparelho tem e que costuma ignorar o `aspect`.
    // Por isso o recorte quadrado e refeito abaixo, sempre.
    allowsEditing: true,
    aspect: [1, 1],
    // Reencoda antes de chegar ate nos, o que derruba o pico de memoria de
    // uma foto de 12 MP antes do nosso proprio processamento.
    quality: 0.7,
    exif: false,
  };

  if (origem === 'camera') {
    // A camera exige permissao em todas as plataformas. A galeria moderna
    // (seletor do sistema no Android 13+ e no iOS) nao exige nenhuma.
    const permissao = await ImagePicker.requestCameraPermissionsAsync();
    if (!permissao.granted) return 'permissao';
  }

  const r =
    origem === 'camera'
      ? await ImagePicker.launchCameraAsync(opcoes)
      : await ImagePicker.launchImageLibraryAsync(opcoes);

  if (r.canceled) return null;
  return r.assets[0]?.uri ?? null;
}

/**
 * Recorta o centro em quadrado, reduz e comprime ate caber no teto.
 */
async function prepararQuadrado(uri: string): Promise<string | null> {
  // Renderizar sem acao nenhuma e como descobrimos as dimensoes reais: o
  // asset do seletor traz `width`/`height`, mas a propria tipagem avisa que
  // podem vir 0 quando o provedor do Android nao informa.
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const lado = Math.min(original.width, original.height);
  if (lado <= 0) return null;

  let pronto = await ImageManipulator.manipulate(original)
    .crop({
      originX: (original.width - lado) / 2,
      originY: (original.height - lado) / 2,
      width: lado,
      height: lado,
    })
    .resize({ width: LADO, height: LADO })
    .renderAsync();

  const cabe = await comprimirAte(pronto);
  if (cabe) return cabe;

  // Foto de fundo texturizado ocupa mais que um rosto em fundo liso. Antes de
  // desistir, vale um passo a menos de resolucao.
  pronto = await ImageManipulator.manipulate(pronto)
    .resize({ width: LADO_REDUZIDO, height: LADO_REDUZIDO })
    .renderAsync();

  return comprimirAte(pronto);
}

async function comprimirAte(imagem: ImageRef): Promise<string | null> {
  for (const compress of QUALIDADES) {
    const r = await imagem.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    if (!r.base64) continue;

    const dataUri = `data:image/jpeg;base64,${r.base64}`;
    if (dataUri.length <= TETO) return dataUri;
  }
  return null;
}
