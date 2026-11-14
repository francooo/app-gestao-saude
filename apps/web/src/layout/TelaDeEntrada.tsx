import type { ReactNode } from 'react';

import ilustracao from '@/imagens/login-bg.jpg';
import { Icone } from '@/ui/Icone';
import { Logo } from '@/ui/Logo';

import estilos from './TelaDeEntrada.module.css';

/**
 * Moldura das telas publicas: login, cadastro e esqueci a senha.
 *
 * Tela larga: a mae com o bebe a esquerda e o cartao creme a direita, com a
 * marca no topo e o selo de protecao no pe — a tela de referencia do login.
 * No celular o cartao vem em cima e a ilustracao embaixo.
 *
 * A ilustracao tem 28% de verde chapado no topo, do mesmo verde do fundo.
 * Ancorada embaixo, o recorte come sempre essa faixa vazia primeiro e nunca o
 * rosto da mae.
 */
export function TelaDeEntrada({ children }: { children: ReactNode }) {
  return (
    <main className={estilos.tela}>
      <div className={estilos.areaDoCartao}>
        <div className={estilos.cartao}>
          <div className={estilos.marca}>
            <Logo tamanho={64} />
          </div>

          {children}

          <p className={estilos.protegido}>
            <Icone nome="mci:shield-check-outline" size={18} />
            Seus dados estão protegidos
          </p>
        </div>
      </div>

      {/* Decorativa: o conteudo da tela ja esta nos rotulos. */}
      <div className={estilos.ilustracao} aria-hidden="true">
        <img src={ilustracao} alt="" />
      </div>
    </main>
  );
}
