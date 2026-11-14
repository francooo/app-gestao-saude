import { createContext, useContext, type ReactNode } from 'react';

import { FundoDeTela, type AreaDoFundo } from '@/layout/FundoDeTela';

import { Icone } from './Icone';
import estilos from './Pagina.module.css';

type Props = {
  /** Qual degrade de fundo: o da area a que a tela pertence. */
  area: AreaDoFundo;
  /**
   * Largura do conteudo: 'coluna' (720, listas e detalhes — a medida de uma
   * tela de celular confortavel), 'formulario' (640) ou 'larga' (1120).
   */
  largura?: 'coluna' | 'formulario' | 'larga';
  children: ReactNode;
};

/**
 * true quando a tela esta dentro de um painel (lista e detalhe lado a lado).
 * Quem monta os paineis ja desenhou o fundo; a tela de dentro nao repete.
 */
export const EmPainel = createContext(false);

/** Moldura de uma tela interna: o fundo da area e a coluna de conteudo centrada. */
export function Pagina({ area, largura = 'coluna', children }: Props) {
  const emPainel = useContext(EmPainel);
  // Dentro de um painel, o <main> da pagina e de quem montou os paineis: dois
  // <main> na mesma pagina confundem o leitor de tela.
  const Raiz = emPainel ? 'div' : 'main';
  return (
    <>
      {emPainel ? null : <FundoDeTela area={area} />}
      <Raiz className={estilos.pagina} data-largura={largura}>
        {children}
      </Raiz>
    </>
  );
}

/** Estado de carga, erro ou vazio dentro de um cartao creme. */
export function Aviso({
  icone,
  erro = false,
  children,
  acao,
}: {
  icone: string;
  erro?: boolean;
  children: ReactNode;
  acao?: { rotulo: string; onClick: () => void };
}) {
  return (
    <div className={estilos.aviso} role={erro ? 'alert' : undefined}>
      <Icone
        nome={icone}
        size={26}
        color={erro ? 'var(--cor-text-error)' : 'var(--cor-accent-green)'}
      />
      <p className={estilos.avisoTexto}>{children}</p>
      {acao ? (
        <button type="button" className={estilos.avisoAcao} onClick={acao.onClick}>
          {acao.rotulo}
        </button>
      ) : null}
    </div>
  );
}
