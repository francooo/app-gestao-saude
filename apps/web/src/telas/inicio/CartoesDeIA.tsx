import { Link } from 'react-router';

import ramoDeCanto from '@/imagens/folhas/ramo-canto.png';
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

const CHIPS = ['Médico', 'Especialidade', 'Medicamentos', 'Quantidade', 'Data da consulta'];

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
    <section className={estilos.cartao} aria-label="Ler receita com IA">
      <img src={ramoDeCanto} alt="" className={estilos.ramo} />

      <div className={estilos.cabecalho}>
        <span className={estilos.seloCamera} aria-hidden="true">
          <Icone nome="camera" size={24} />
          <Icone
            nome="mci:star-four-points"
            size={18}
            color="var(--cor-star)"
            className={estilos.brilho}
          />
          <span className={estilos.seloIA}>IA</span>
        </span>
        <div className={estilos.textos}>
          <h2 className={estilos.titulo}>Ler receita com IA</h2>
          <p className={estilos.subtitulo}>Tire uma foto e preencha os dados automaticamente</p>
          {bloqueado ? <SeloDeAssinatura /> : null}
        </div>
      </div>

      {bloqueado ? (
        <>
          <Link
            to="/conta/assinatura"
            className={estilos.botao}
            aria-label="Fotografar receita. Faz parte da assinatura."
          >
            <Icone nome="lock" size={18} />
            Fotografar receita
          </Link>
          <Link
            to="/conta/assinatura"
            className={estilos.galeria}
            aria-label="Escolher um arquivo. Faz parte da assinatura."
          >
            <Icone nome="image" size={16} />
            Escolher um arquivo
          </Link>
        </>
      ) : (
        <>
          <button type="button" className={estilos.botao} onClick={() => onEscolher(true)}>
            <Icone nome="camera" size={18} />
            Fotografar receita
          </button>
          {/* No aplicativo e "da galeria"; no computador a foto e um arquivo. */}
          <button type="button" className={estilos.galeria} onClick={() => onEscolher(false)}>
            <Icone nome="image" size={16} />
            Escolher um arquivo
          </button>
        </>
      )}

      <ul className={estilos.chips} aria-label="O que a leitura preenche">
        {CHIPS.map((rotulo) => (
          <li key={rotulo} className={estilos.chip}>
            <Icone nome="check" size={12} />
            {rotulo}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Atalho para o Assistente. O campo e so ilustrativo — nao e um input de
 * proposito: o cartao inteiro e um link para a conversa.
 */
export function AssistantCard({ bloqueado = false }: { bloqueado?: boolean }) {
  return (
    <Link
      to={bloqueado ? '/conta/assinatura' : '/assistente'}
      className={`${estilos.cartao} ${estilos.cartaoLink}`}
      aria-label={
        bloqueado
          ? 'Assistente de Saúde. Faz parte da assinatura.'
          : 'Assistente de Saúde. Abre a conversa.'
      }
    >
      <img src={ramoDeCanto} alt="" className={estilos.ramo} />

      <div className={estilos.cabecalho}>
        <span className={estilos.seloBrilho} aria-hidden="true">
          <Icone nome="mci:star-four-points" size={22} />
        </span>
        <div className={estilos.textos}>
          <h2 className={estilos.titulo}>Assistente de Saúde</h2>
          <p className={estilos.subtitulo}>Tire dúvidas sobre remédios e consultas</p>
          {bloqueado ? <SeloDeAssinatura /> : null}
        </div>
      </div>

      <div className={estilos.campo} aria-hidden="true">
        <span className={estilos.placeholder}>Ex.: quando é a próxima dose do Lucas?</span>
        <span className={estilos.enviar}>
          <Icone nome={bloqueado ? 'lock' : 'send'} size={18} />
        </span>
      </div>
    </Link>
  );
}
