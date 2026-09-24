/**
 * Tira a marcacao do texto que o modelo escreve.
 *
 * A bolha da conversa desenha caracteres crus, entao um `**negrito**` aparece
 * com os asteriscos e uma tabela vira uma parede de barras verticais.
 *
 * O texto de sistema JA pede texto corrido — e o modelo ignora. Foi medido:
 * mesmo com a regra explicita, ele continuou devolvendo titulos, negrito e
 * tabelas. Instrucao e pedido; isto aqui e garantia. As duas coisas ficam,
 * porque a instrucao reduz o volume e esta funcao cuida do resto.
 *
 * O que ela NAO faz: interpretar a marcacao e desenhar bonito. Isso exigiria
 * um renderizador de markdown, e uma tabela dentro de uma bolha de conversa
 * continuaria ilegivel num celular. Aqui o objetivo e so nao mostrar sujeira.
 */

/**
 * Marcador de citacao interno do modelo, no formato 【1†L90-L92】.
 *
 * Nao e markdown: e a referencia que a busca do Groq usa entre os proprios
 * componentes. Nao significa NADA para quem le, e vazava direto na tela.
 */
const CITACAO_INTERNA = /【[^【】]*】/g;

/** Linha de separacao de tabela: |---|:--:|---| */
const SEPARADOR_DE_TABELA = /^\s*\|?[\s:|-]*\|[\s:|-]*$/;

function limparLinha(linha: string): string {
  let texto = linha;

  // Titulo markdown: "## Dose" vira "Dose".
  texto = texto.replace(/^\s{0,3}#{1,6}\s+/, '');

  // Citacao em bloco: "> importante" vira "importante".
  texto = texto.replace(/^\s{0,3}>\s?/, '');

  // Linha de tabela: as celulas viram uma frase separada por travessao.
  if (/^\s*\|.*\|\s*$/.test(texto)) {
    texto = texto
      .replace(/^\s*\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim())
      .filter(Boolean)
      .join(' — ');
  }

  // Marcador de lista: "* item" e "+ item" viram "- item", que ja se le bem.
  texto = texto.replace(/^(\s*)[*+]\s+/, '$1- ');

  return texto;
}

export function limparMarkdown(bruto: string): string {
  if (!bruto) return bruto;

  const linhas = bruto
    .split('\n')
    .filter((l) => !SEPARADOR_DE_TABELA.test(l) || l.trim() === '')
    .map(limparLinha);

  let texto = linhas.join('\n');

  texto = texto.replace(CITACAO_INTERNA, '');

  // Negrito e italico. A ordem importa: ** antes de *, senao o primeiro
  // asterisco do par duplo seria consumido sozinho e sobraria um solto.
  texto = texto.replace(/\*\*([^*]+)\*\*/g, '$1');
  texto = texto.replace(/__([^_]+)__/g, '$1');
  texto = texto.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:!?]|$)/g, '$1$2');

  // Codigo: crase simples e bloco de crases.
  texto = texto.replace(/```[a-z]*\n?/gi, '');
  texto = texto.replace(/`([^`\n]+)`/g, '$1');

  // Link markdown: [Anvisa](https://...) vira "Anvisa (https://...)". O
  // endereco FICA — e o que permite conferir a fonte.
  texto = texto.replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)');

  // Tres ou mais quebras seguidas viram duas: sem isto, tirar os titulos deixa
  // buracos enormes no meio da bolha.
  texto = texto.replace(/\n{3,}/g, '\n\n');

  return texto.trim();
}
