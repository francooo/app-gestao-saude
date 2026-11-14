import { Link } from 'react-router';

import medica from '@/imagens/assistente-medica.png';
import ilustracao from '@/imagens/receita-por-foto.jpg';
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
 * "Ler receita com IA": a entrada do cadastro por foto.
 *
 * O seletor de arquivo abre AQUI, e so se navega para a leitura quando ha
 * imagem: cancelar o seletor nao joga ninguem em outra tela.
 *
 * Sem o plano o cartao continua na tela — e a vitrine do que a assinatura
 * traz — com selo, e os dois caminhos levam a tela de assinatura.
 */
export function CartaoLerReceita({
  bloqueado = false,
  onEscolher,
}: {
  bloqueado?: boolean;
  /** Chamado direto do clique; `camera` sugere a camera no celular. */
  onEscolher: (camera: boolean) => void;
}) {
  return (
    <section className={estilos.receita} aria-label="Ler receita com IA">
      {/* Recorte da tela de referencia; a mascara funde a borda no degrade. */}
      <img src={ilustracao} alt="" className={estilos.ilustracao} />

      <div className={estilos.receitaConteudo}>
        <div className={estilos.cabecalho}>
          <span className={estilos.seloDocumento} aria-hidden="true">
            <Icone nome="file-text" size={34} />
          </span>
          <div className={estilos.textos}>
            <h2 className={estilos.titulo}>Ler receita com IA</h2>
            <p className={estilos.subtitulo}>
              Tire uma foto e preencha os dados automaticamente.
            </p>
            {bloqueado ? <SeloDeAssinatura /> : null}
          </div>
        </div>

        <div className={estilos.acoes}>
          {bloqueado ? (
            <>
              <Link
                to="/conta/assinatura"
                className={estilos.botao}
                aria-label="Fotografar receita. Faz parte da assinatura."
              >
                <Icone nome="lock" size={20} />
                Fotografar receita
              </Link>
              <Link
                to="/conta/assinatura"
                className={estilos.arquivo}
                aria-label="Escolher um arquivo. Faz parte da assinatura."
              >
                <Icone nome="image" size={16} />
                Escolher um arquivo
              </Link>
            </>
          ) : (
            <>
              <button type="button" className={estilos.botao} onClick={() => onEscolher(true)}>
                <Icone nome="camera" size={22} />
                Fotografar receita
              </button>
              {/* No computador nao ha camera para "fotografar": a foto e um arquivo. */}
              <button type="button" className={estilos.arquivo} onClick={() => onEscolher(false)}>
                <Icone nome="image" size={16} />
                Escolher um arquivo
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * Atalho para o Assistente. O campo e so ilustrativo — nao e um input de
 * proposito: o cartao inteiro e um link para a conversa, onde ha o campo de
 * verdade. Dois campos que aceitam digitacao seria pior que um so.
 */
export function AssistantCard({ bloqueado = false }: { bloqueado?: boolean }) {
  return (
    <Link
      to={bloqueado ? '/conta/assinatura' : '/assistente'}
      className={estilos.assistente}
      aria-label={
        bloqueado
          ? 'Assistente de Saúde. Faz parte da assinatura.'
          : 'Assistente de Saúde. Abre a conversa.'
      }
    >
      <img src={medica} alt="" className={estilos.medica} width={132} height={132} />
      <span className={estilos.pergunta}>Como posso ajudar hoje?</span>
      {bloqueado ? <SeloDeAssinatura /> : null}
      <span className={estilos.campo} aria-hidden="true">
        <span className={estilos.falso}>Ex.: quando é a próxima dose?</span>
        <span className={estilos.enviar}>
          <Icone nome={bloqueado ? 'lock' : 'send'} size={20} />
        </span>
      </span>
    </Link>
  );
}
