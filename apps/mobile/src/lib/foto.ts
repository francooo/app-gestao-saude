import { ImageManipulator, SaveFormat, type ImageRef } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Escolha e preparo de imagens.
 *
 * Unico lugar do aplicativo que conhece o seletor de imagens e o manipulador;
 * o resto da base so ve um data URI pronto para enviar.
 *
 * DOIS CAMINHOS, e nao um com parametro: `escolherFoto` para RETRATO (perfil,
 * medico) e `escolherFotoDeDocumento` para RECEITA. Eles diferem em quatro
 * coisas — recorte quadrado, resolucao, tabela de qualidades e teto — e um
 * `modo: 'avatar' | 'documento'` espalharia quatro ternarios pelo miolo, cada
 * um uma chance de o retrato regredir. Separados, mexer num nao toca no outro.
 */

/** Lado do quadrado final, em pixels. */
const LADO = 200;
/** Lado de recurso, quando nem a menor qualidade cabe no teto. */
const LADO_REDUZIDO = 150;

/**
 * Maior lado de um DOCUMENTO fotografado, em pixels.
 *
 * Uma receita A5 fotografada inteira nesta largura da cerca de 215 dpi, o que
 * deixa texto impresso de 10 pt e letra manuscrita legiveis com zoom. Em A4,
 * ~150 dpi, ainda legivel. Os 200 px do retrato dariam 13 dpi — ou seja, nada.
 *
 * Subir para 1600 ou 2048 melhora pouco a leitura numa tela de celular e
 * engorda o arquivo quadraticamente.
 */
const LADO_DOCUMENTO = 1280;
const LADO_DOCUMENTO_REDUZIDO = 1024;

/**
 * Teto do documento: ~300 KB binarios.
 *
 * O contrato do servidor aceita 500 000; paramos antes pelo mesmo motivo do
 * retrato — a validacao de la tem que ser rede de seguranca, nao o mecanismo
 * que a pessoa encontra.
 */
const TETO_DOCUMENTO = 400_000;

/**
 * Mais altas que as do retrato, de proposito.
 *
 * Abaixo de ~0,4 o JPEG borra traco fino, e e ai que "1 comprimido" escrito a
 * caneta vira ilegivel. Um rosto em 200x200 tolera 0,3; caneta azul em papel
 * branco nao.
 */
const QUALIDADES_DOCUMENTO = [0.7, 0.55, 0.4];

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
    const escolha = await abrirSeletor(origem, true);
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

async function abrirSeletor(
  origem: 'camera' | 'galeria',
  recortar: boolean,
): Promise<string | null | 'permissao'> {
  const opcoes: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    // Conveniencia, nao garantia: no Android esta e uma tela de corte do
    // sistema que nem todo aparelho tem e que costuma ignorar o `aspect`.
    // Por isso o recorte quadrado e refeito abaixo, sempre.
    //
    // No documento ela fica DESLIGADA: a tela de corte do sistema convida a
    // aparar a foto, e aparar uma receita costuma decepar justamente o
    // cabecalho, onde estao o nome e o CRM de quem receitou.
    allowsEditing: recortar,
    ...(recortar ? { aspect: [1, 1] as [number, number] } : {}),
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

  const cabe = await comprimirAte(pronto, TETO, QUALIDADES);
  if (cabe) return cabe;

  // Foto de fundo texturizado ocupa mais que um rosto em fundo liso. Antes de
  // desistir, vale um passo a menos de resolucao.
  pronto = await ImageManipulator.manipulate(pronto)
    .resize({ width: LADO_REDUZIDO, height: LADO_REDUZIDO })
    .renderAsync();

  return comprimirAte(pronto, TETO, QUALIDADES);
}

async function comprimirAte(
  imagem: ImageRef,
  teto: number,
  qualidades: number[],
): Promise<string | null> {
  for (const compress of qualidades) {
    const r = await imagem.saveAsync({ format: SaveFormat.JPEG, compress, base64: true });
    if (!r.base64) continue;

    const dataUri = `data:image/jpeg;base64,${r.base64}`;
    if (dataUri.length <= teto) return dataUri;
  }
  return null;
}

/**
 * Escolhe e prepara a foto de um DOCUMENTO — hoje, a receita medica.
 *
 * As duas propriedades que o manipulador da de graca (ver escolherFoto) valem
 * ainda mais aqui, e a segunda e a razao de esta funcao nunca poder mandar a
 * URI crua do seletor: reencodar APAGA TODO O EXIF, inclusive o GPS. A receita
 * e fotografada em casa ou no consultorio, e a coordenada seria de um dos
 * dois. O manipulador nao e otimizacao; e o apagador de metadados.
 */
export async function escolherFotoDeDocumento(
  origem: 'camera' | 'galeria',
): Promise<ResultadoFoto> {
  try {
    const escolha = await abrirSeletor(origem, false);
    if (escolha === 'permissao') return { ok: false, motivo: 'permissao' };
    if (!escolha) return { ok: false, motivo: 'cancelado' };

    const dataUri = await prepararDocumento(escolha);
    return dataUri ? { ok: true, dataUri } : { ok: false, motivo: 'falha' };
  } catch {
    return { ok: false, motivo: 'falha' };
  }
}

/**
 * Reduz pelo MAIOR lado e nao recorta nada.
 *
 * Preservar a proporcao e o ponto: receita e retrato ou paisagem, e o recorte
 * central do caminho de retrato cortaria as bordas do papel — onde ficam o
 * cabecalho e a assinatura.
 */
async function prepararDocumento(uri: string): Promise<string | null> {
  const original = await ImageManipulator.manipulate(uri).renderAsync();
  const maior = Math.max(original.width, original.height);
  if (maior <= 0) return null;

  // Informar so um lado faz o manipulador deduzir o outro pela proporcao.
  // Informar os dois distorceria o papel.
  const encolher = (alvo: number) =>
    original.width >= original.height ? { width: alvo } : { height: alvo };

  let pronto =
    maior > LADO_DOCUMENTO
      ? await ImageManipulator.manipulate(original).resize(encolher(LADO_DOCUMENTO)).renderAsync()
      : original;

  const cabe = await comprimirAte(pronto, TETO_DOCUMENTO, QUALIDADES_DOCUMENTO);
  if (cabe) return cabe;

  // Papel amassado, sombra, fundo texturizado: tudo isso engorda o JPEG. Antes
  // de desistir, vale um degrau a menos de resolucao — 1024 ainda da ~170 dpi
  // numa receita A5.
  pronto = await ImageManipulator.manipulate(pronto)
    .resize(encolher(LADO_DOCUMENTO_REDUZIDO))
    .renderAsync();

  return comprimirAte(pronto, TETO_DOCUMENTO, QUALIDADES_DOCUMENTO);
}
