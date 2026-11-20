import { Link } from 'react-router';

import assistente from '@/imagens/repag/assistente.webp';
import maoReceita from '@/imagens/repag/mao-receita.webp';
import { Icone } from '@/ui/Icone';

import estilos from './CartoesDeIA.module.css';

/** Selo dos recursos que pedem assinatura. */
function SeloDeAssinatura() {
  return (
    <span className={estilos.seloAssinatura} aria-hidden="true">
      <Icone nome="lock" size={12} />
      Assinatura
    </span>
  );
}

/**
 * "Ler receita com IA" (mock 01): faixa terracota com o documento num circulo
 * claro, o texto e a seta, e a mao com o celular a direita.
 *
 * O seletor de arquivo abre AQUI, e so se navega para a leitura quando ha
 * imagem: cancelar o seletor nao joga ninguem em outra tela. Sem o plano a
 * faixa continua (e a vitrine do que a assinatura traz), com selo, e leva a
 * tela de assinatura.
 */
export function CartaoLerReceita({
  bloqueado = false,
  onEscolher,
}: {
  bloqueado?: boolean;
  /** Chamado direto do clique; `camera` sugere a camera no celular. */
  onEscolher: (camera: boolean) => void;
}) {
  const miolo = (
    <>
      <span className={estilos.documento} aria-hidden="true">
        <Icone nome="file-text" size={34} />
      </span>
      <span className={estilos.textos}>
        <span className={estilos.titulo}>Ler receita com IA</span>
        <span className={estilos.subtitulo}>Tire uma foto e preencha os dados automaticamente.</span>
        {bloqueado ? <SeloDeAssinatura /> : null}
      </span>
      <span className={estilos.seta} aria-hidden="true">
        <Icone nome={bloqueado ? 'lock' : 'chevron-right'} size={22} />
      </span>
    </>
  );

  return (
    <section className={estilos.receita} aria-label="Ler receita com IA">
      {bloqueado ? (
        <Link to="/conta/assinatura" className={estilos.acao} aria-label="Ler receita com IA. Faz parte da assinatura.">
          {miolo}
        </Link>
      ) : (
        <button type="button" className={estilos.acao} onClick={() => onEscolher(true)}>
          {miolo}
        </button>
      )}
      <img src={maoReceita} alt="" className={estilos.ilustracao} />
    </section>
  );
}

/**
 * "Como posso ajudar hoje?" (mock 01): bolha com a assistente, presa ao canto
 * de baixo da janela no computador e em linha no celular. Leva a conversa.
 */
export function AssistantCard({ bloqueado = false }: { bloqueado?: boolean }) {
  return (
    <Link
      to={bloqueado ? '/conta/assinatura' : '/assistente'}
      className={estilos.bolha}
      aria-label={bloqueado ? 'Assistente de Saúde. Faz parte da assinatura.' : 'Assistente de Saúde: como posso ajudar hoje?'}
    >
      <img src={assistente} alt="" className={estilos.avatar} width={64} height={64} />
      <span className={estilos.pergunta}>Como posso ajudar hoje?</span>
      <span className={estilos.ir} aria-hidden="true">
        <Icone nome={bloqueado ? 'lock' : 'chevron-right'} size={18} />
      </span>
    </Link>
  );
}
