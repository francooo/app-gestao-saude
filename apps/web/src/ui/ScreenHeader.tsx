import type { ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';

import { useContextoDaPagina } from '@/lib/pessoaAtiva';

import { Icone } from './Icone';
import { PontoDeAvisos } from './PontoDeAvisos';
import estilos from './ScreenHeader.module.css';

type Props = {
  title: string;
  /** Frase curta sob o titulo ("Mantenha os medicamentos da sua família sempre em dia."). */
  subtitle?: string;
  /**
   * Para onde o voltar leva: um caminho fixo, ou 'historico' para a pagina
   * anterior do navegador. Sem ele, a tela e uma das areas do cabecalho.
   */
  voltar?: string | 'historico';
  /** Acoes da tela, a direita do titulo. */
  acoes?: ReactNode;
  /**
   * A linha acima do titulo, com o raminho: "Cuidado de Ana Clara" / "Família
   * toda" vem sozinho do seletor de membros. Passe um texto para trocar (ex.:
   * a trilha "Remédios / Detalhe do medicamento") ou false para esconder.
   */
  contexto?: ReactNode | false;
  /** Ilustracao aquarelada a direita (imagens/repag). Some no celular. */
  ilustracao?: string;
  /** O coracao terracota depois do titulo, como nos mocks. */
  coracao?: boolean;
  /** Aceito por compatibilidade e ignorado: o sino mora no cabecalho global (layout/Casca). */
  mostrarSino?: boolean;
};

/**
 * Cabecalho de pagina da repaginacao: linha de contexto com raminho, titulo
 * grande com o coracao, subtitulo e a ilustracao opcional a direita.
 */
export function ScreenHeader({ title, subtitle, voltar, acoes, contexto, ilustracao, coracao = true }: Props) {
  const navigate = useNavigate();
  const automatico = useContextoDaPagina();
  const linha = contexto === false ? null : (contexto ?? automatico);

  return (
    <header className={estilos.cabecalho} data-com-ilustracao={ilustracao ? '' : undefined}>
      <div className={estilos.principal}>
        {voltar === 'historico' ? (
          <button type="button" className={estilos.botao} onClick={() => navigate(-1)} aria-label="Voltar">
            <Icone nome="chevron-left" size={24} />
          </button>
        ) : voltar ? (
          <Link to={voltar} className={estilos.botao} aria-label="Voltar">
            <Icone nome="chevron-left" size={24} />
          </Link>
        ) : null}

        <div className={estilos.textos}>
          {linha ? (
            <p className={estilos.contexto}>
              <Icone nome="sprout" size={20} />
              <span>{linha}</span>
            </p>
          ) : null}
          <h1 className={estilos.titulo}>
            {title}
            {coracao ? (
              <span className={estilos.coracao} aria-hidden="true">
                <Icone nome="heart" size={30} />
              </span>
            ) : null}
          </h1>
          {subtitle ? <p className={estilos.subtitulo}>{subtitle}</p> : null}
        </div>

        {acoes ? <div className={estilos.acoes}>{acoes}</div> : null}
      </div>

      {ilustracao ? <img src={ilustracao} alt="" className={estilos.ilustracao} /> : null}
    </header>
  );
}

/** O sino de avisos, com o ponto de "ha novidades". Mora no cabecalho global. */
export function Sino({ className }: { className?: string }) {
  return (
    <Link
      to="/notificacoes"
      className={[estilos.botao, estilos.sino, className].filter(Boolean).join(' ')}
      aria-label="Avisos"
      title="Avisos"
    >
      <Icone nome="bell" size={22} />
      <PontoDeAvisos />
    </Link>
  );
}
