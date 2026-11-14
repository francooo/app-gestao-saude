/**
 * Fotos na versao web: escolher um arquivo (ou a camera, no celular) e
 * reduzi-lo antes de enviar.
 *
 * Os tamanhos e tetos sao os MESMOS de apps/mobile/src/lib/foto.ts — a API
 * recusa o que passar deles, e uma foto guardada pela web precisa caber onde
 * a do aplicativo cabe. La o trabalho e do expo-image-manipulator; aqui, de um
 * <canvas>.
 *
 * Nao ha a pergunta "camera ou galeria" do aplicativo: o seletor de arquivo do
 * navegador ja oferece as duas coisas no celular, e no computador so existe
 * arquivo.
 */

// Retrato (medico, membro da familia): quadrado pequeno.
const LADO = 200;
const LADO_REDUZIDO = 150;
const TETO = 24_000;
const QUALIDADES = [0.6, 0.45, 0.3];

// Documento (receita, caixa): legivel, com o lado maior limitado.
const LADO_DOCUMENTO = 1280;
const LADO_DOCUMENTO_REDUZIDO = 1024;
const TETO_DOCUMENTO = 400_000;
const QUALIDADES_DOCUMENTO = [0.7, 0.55, 0.4];

export type ResultadoFoto =
  | { ok: true; dataUri: string }
  | { ok: false; motivo: 'cancelado' | 'falha' };

/**
 * Abre o seletor de arquivos do navegador.
 *
 * PRECISA ser chamada direto do clique: o navegador so abre o seletor em
 * resposta a um gesto, e um `await` antes desta chamada ja perde o gesto.
 */
function abrirSeletor(camera: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    // No celular, sugere a camera traseira; no computador o atributo e ignorado.
    if (camera) input.capture = 'environment';
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
    input.addEventListener('cancel', () => resolve(null), { once: true });
    input.click();
  });
}

async function carregar(arquivo: File): Promise<ImageBitmap | HTMLImageElement> {
  // createImageBitmap respeita a orientacao EXIF (foto de celular deitada).
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
    } catch {
      // Formato que o navegador nao decodifica por aqui: tenta pelo <img>.
    }
  }
  const url = URL.createObjectURL(arquivo);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Recorte = { sx: number; sy: number; sw: number; sh: number; w: number; h: number };

function desenhar(imagem: ImageBitmap | HTMLImageElement, r: Recorte): HTMLCanvasElement | null {
  const canvas = document.createElement('canvas');
  canvas.width = r.w;
  canvas.height = r.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // JPEG nao tem transparencia: PNG transparente viraria preto sem este fundo.
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, r.w, r.h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(imagem, r.sx, r.sy, r.sw, r.sh, 0, 0, r.w, r.h);
  return canvas;
}

function comprimirAte(canvas: HTMLCanvasElement, teto: number, qualidades: number[]): string | null {
  for (const qualidade of qualidades) {
    const dataUri = canvas.toDataURL('image/jpeg', qualidade);
    if (dataUri.length <= teto) return dataUri;
  }
  return null;
}

function prepararQuadrado(imagem: ImageBitmap | HTMLImageElement): string | null {
  const lado = Math.min(imagem.width, imagem.height);
  if (lado <= 0) return null;
  const centro = { sx: (imagem.width - lado) / 2, sy: (imagem.height - lado) / 2, sw: lado, sh: lado };
  for (const alvo of [LADO, LADO_REDUZIDO]) {
    const canvas = desenhar(imagem, { ...centro, w: alvo, h: alvo });
    const cabe = canvas && comprimirAte(canvas, TETO, QUALIDADES);
    if (cabe) return cabe;
  }
  return null;
}

function prepararDocumento(imagem: ImageBitmap | HTMLImageElement): string | null {
  const maior = Math.max(imagem.width, imagem.height);
  if (maior <= 0) return null;
  for (const alvo of [LADO_DOCUMENTO, LADO_DOCUMENTO_REDUZIDO]) {
    const escala = Math.min(1, alvo / maior);
    const canvas = desenhar(imagem, {
      sx: 0,
      sy: 0,
      sw: imagem.width,
      sh: imagem.height,
      w: Math.round(imagem.width * escala),
      h: Math.round(imagem.height * escala),
    });
    const cabe = canvas && comprimirAte(canvas, TETO_DOCUMENTO, QUALIDADES_DOCUMENTO);
    if (cabe) return cabe;
  }
  return null;
}

async function escolher(
  camera: boolean,
  preparar: (imagem: ImageBitmap | HTMLImageElement) => string | null,
): Promise<ResultadoFoto> {
  const arquivo = await abrirSeletor(camera);
  if (!arquivo) return { ok: false, motivo: 'cancelado' };
  try {
    const dataUri = preparar(await carregar(arquivo));
    return dataUri ? { ok: true, dataUri } : { ok: false, motivo: 'falha' };
  } catch {
    return { ok: false, motivo: 'falha' };
  }
}

/** Retrato quadrado de 200 px (medico, membro da familia). Chame direto do clique. */
export function escolherFoto(opcoes?: { camera?: boolean }): Promise<ResultadoFoto> {
  return escolher(opcoes?.camera ?? false, prepararQuadrado);
}

/** Receita ou caixa: ate 1280 px no lado maior. Chame direto do clique. */
export function escolherFotoDeDocumento(opcoes?: { camera?: boolean }): Promise<ResultadoFoto> {
  return escolher(opcoes?.camera ?? false, prepararDocumento);
}
