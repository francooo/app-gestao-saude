/**
 * Gera src/estilos/tokens.css a partir de packages/shared/src/theme.ts.
 *
 * O theme.ts e a fonte unica dos tokens (o aplicativo mobile le o mesmo
 * arquivo). Este script so traduz para variaveis CSS, para nenhum hexadecimal
 * ser copiado a mao. Rode `pnpm --filter @gestao/web tokens` depois de mudar
 * o theme.ts e versione o resultado.
 *
 * Precisa de Node que execute TypeScript direto (22.18+ ou 24).
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const { colors, backgrounds, radii, spacing, sizes, typography, avatarColors } = await import(
  '../../../packages/shared/src/theme.ts'
);

const kebab = (nome) => nome.replace(/[A-Z]/g, (l) => `-${l.toLowerCase()}`);
const PESO = { Nunito_400Regular: 400, Nunito_600SemiBold: 600, Nunito_700Bold: 700, Nunito_800ExtraBold: 800 };

const linhas = [];
const secao = (titulo) => linhas.push('', `  /* ${titulo} */`);
const variavel = (nome, valor) => linhas.push(`  --${nome}: ${valor};`);

secao('Cores');
for (const [nome, valor] of Object.entries(colors)) variavel(`cor-${kebab(nome)}`, valor);

secao('Fundos de tela: degrade vertical de cada area');
for (const [nome, paradas] of Object.entries(backgrounds)) {
  variavel(`fundo-${kebab(nome)}`, `linear-gradient(180deg, ${paradas.join(', ')})`);
}

secao('Avatares');
avatarColors.forEach((cor, i) => variavel(`cor-avatar-${i + 1}`, cor));

secao('Raios');
for (const [nome, valor] of Object.entries(radii)) variavel(`raio-${kebab(nome)}`, `${valor}px`);

secao('Espacamentos');
for (const [nome, valor] of Object.entries(spacing)) variavel(`espaco-${kebab(nome)}`, `${valor}px`);

secao('Tamanhos');
for (const [nome, valor] of Object.entries(sizes)) variavel(`tamanho-${kebab(nome)}`, `${valor}px`);

secao('Tipografia');
for (const [nome, estilo] of Object.entries(typography)) {
  variavel(`texto-${kebab(nome)}-tamanho`, `${estilo.fontSize}px`);
  variavel(`texto-${kebab(nome)}-peso`, PESO[estilo.fontFamily]);
  if (estilo.letterSpacing) variavel(`texto-${kebab(nome)}-espacamento`, `${estilo.letterSpacing}px`);
}

const css = `/*
 * GERADO por scripts/gerar-tokens.mjs a partir de packages/shared/src/theme.ts.
 * Nao edite a mao: mude o theme.ts e rode \`pnpm --filter @gestao/web tokens\`.
 */
:root {${linhas.join('\n')}
}
`;

const destino = fileURLToPath(new URL('../src/estilos/tokens.css', import.meta.url));
writeFileSync(destino, css);
console.log(`tokens.css: ${linhas.filter((l) => l.includes('--')).length} variaveis`);
