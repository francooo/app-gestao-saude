import type { ReactNode } from 'react';

import ilustracao from '@/imagens/login-bg.jpg';

import estilos from './TelaDeEntrada.module.css';

/**
 * Moldura das telas publicas: login, cadastro e esqueci a senha.
 *
 * No celular e a tela do aplicativo — cartao translucido em cima, a mae com o
 * bebe embaixo. Em tela larga os dois ficam lado a lado: a ilustracao a
 * esquerda, o cartao a direita.
 *
 * A ilustracao tem 28% de verde chapado no topo, do mesmo verde do fundo.
 * Ancorada embaixo, o recorte come sempre essa faixa vazia primeiro e nunca o
 * rosto da mae — o mesmo truque do IllustrationRegion do aplicativo.
 */
export function TelaDeEntrada({ children }: { children: ReactNode }) {
  return (
    <main className={estilos.tela}>
      <div className={estilos.areaDoCartao}>
        <div className={estilos.cartao}>{children}</div>
      </div>
      {/* Decorativa: o conteudo da tela ja esta nos rotulos. */}
      <div className={estilos.ilustracao} aria-hidden="true">
        <img src={ilustracao} alt="" />
      </div>
    </main>
  );
}
