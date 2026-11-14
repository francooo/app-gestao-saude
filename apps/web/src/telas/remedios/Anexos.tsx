import { useEffect, useState } from 'react';

import botoes from '@/ui/botoes.module.css';
import { Icone } from '@/ui/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/ui/IconTile';
import { ImageViewer } from '@/ui/ImageViewer';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './Anexos.module.css';

type PropsDaEmbalagem = {
  foto: string | null;
  /** Nome do remedio, para os rotulos de leitor de tela. */
  doQue: string;
  ocupada?: 'enviando' | 'removendo' | null;
  /** Abre o seletor de arquivo. Chamado direto do clique (exigencia do navegador). */
  onEscolher: () => void;
  onRemover: () => void;
};

/**
 * Faixa da foto da caixinha, dentro do cartao do remedio.
 *
 * Com foto, clicar na miniatura AMPLIA (por isso a lupa, e nao uma camera), e
 * ao lado ficam Trocar e Remover — no aplicativo eles moram atras de um menu
 * "...", que aqui nao precisa existir: ha espaco para os dois.
 */
export function FotoDaEmbalagem({
  foto,
  doQue,
  ocupada = null,
  onEscolher,
  onRemover,
}: PropsDaEmbalagem) {
  const [ampliada, setAmpliada] = useState(false);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [foto]);

  const mostrarFoto = Boolean(foto) && !falhou;
  const inerte = ocupada !== null;
  const { titulo, ajuda } = textosDaEmbalagem(foto, falhou, ocupada);

  return (
    <div className={estilos.faixa}>
      <button
        type="button"
        className={estilos.alvo}
        disabled={inerte || (Boolean(foto) && falhou)}
        onClick={() => (mostrarFoto ? setAmpliada(true) : onEscolher())}
        aria-label={
          inerte
            ? titulo
            : mostrarFoto
              ? `Ampliar a foto da caixinha de ${doQue}`
              : 'Adicionar foto da caixinha'
        }
      >
        <span className={estilos.slot}>
          {mostrarFoto ? (
            <img
              src={foto!}
              alt=""
              className={estilos.miniatura}
              onError={() => setFalhou(true)}
            />
          ) : (
            <Icone
              nome={falhou ? 'image' : 'camera'}
              size={24}
              color="var(--cor-pill-tablet-icon)"
            />
          )}
          {mostrarFoto && !inerte ? (
            <span className={estilos.lupa}>
              <Icone nome="maximize-2" size={12} />
            </span>
          ) : null}
          {inerte ? (
            <span className={estilos.veu}>
              <span className={botoes.girando} />
            </span>
          ) : null}
        </span>
        <span className={estilos.textos}>
          <span className={estilos.titulo}>{titulo}</span>
          <span className={estilos.ajuda}>{ajuda}</span>
        </span>
      </button>

      {inerte ? null : foto ? (
        <div className={estilos.acoesDaFoto}>
          <button type="button" className={botoes.texto} onClick={onEscolher}>
            Trocar
          </button>
          <button type="button" className={botoes.perigo} onClick={onRemover}>
            Remover
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={estilos.adicionar}
          onClick={onEscolher}
          aria-label="Adicionar foto da caixinha"
        >
          <Icone nome="plus-circle" size={20} />
        </button>
      )}

      <ImageViewer
        uri={foto ?? ''}
        visivel={ampliada && mostrarFoto}
        descricao={`Foto da caixinha de ${doQue}`}
        onClose={() => setAmpliada(false)}
      />
    </div>
  );
}

function textosDaEmbalagem(
  foto: string | null,
  falhou: boolean,
  ocupada: 'enviando' | 'removendo' | null,
) {
  if (ocupada === 'enviando') {
    return { titulo: 'Guardando a foto…', ajuda: 'Pode levar alguns segundos.' };
  }
  if (ocupada === 'removendo') {
    return { titulo: 'Removendo a foto…', ajuda: 'Pode levar alguns segundos.' };
  }
  if (foto && falhou) {
    return { titulo: 'Foto da caixinha', ajuda: 'Não consegui mostrar esta foto.' };
  }
  if (foto) return { titulo: 'Foto da caixinha', ajuda: 'Clique para ampliar.' };
  return {
    titulo: 'Adicionar foto da caixinha',
    ajuda: 'Ajuda a reconhecer o remédio na hora de tomar.',
  };
}

type PropsDaReceita = {
  foto: string | null;
  doQue: string;
  prescritor?: string | null;
  ocupado?: boolean;
  onEscolher: () => void;
  onRemover: () => void;
};

/** Cartao da prescricao: convida a anexar a receita, ou mostra a que ja existe. */
export function PrescriptionCard({
  foto,
  doQue,
  prescritor,
  ocupado = false,
  onEscolher,
  onRemover,
}: PropsDaReceita) {
  const [ampliada, setAmpliada] = useState(false);

  if (!foto) {
    return (
      <SurfaceCard className={estilos.cartao}>
        <div className={estilos.linha}>
          <IconTile icone="file-text" {...LADRILHO_NEUTRO} />
          <div className={estilos.textos}>
            <p className={estilos.tituloDaReceita}>Nenhuma prescrição anexada</p>
            <p className={estilos.ajudaDaReceita}>
              Inclua a receita disponibilizada pela sua médica.
            </p>
          </div>
        </div>
        <button
          type="button"
          className={`${botoes.ambar} ${botoes.largo} ${estilos.botaoDaReceita}`}
          disabled={ocupado}
          onClick={onEscolher}
        >
          {ocupado ? <span className={botoes.girando} /> : null}
          Adicionar prescrição
        </button>
      </SurfaceCard>
    );
  }

  return (
    <SurfaceCard className={estilos.cartao}>
      <button
        type="button"
        className={estilos.receita}
        disabled={ocupado}
        onClick={() => setAmpliada(true)}
        aria-label={`Ampliar a foto da receita de ${doQue}`}
      >
        <img src={foto} alt="" />
        <span className={estilos.lupaGrande}>
          <Icone nome="maximize-2" size={15} />
        </span>
        {ocupado ? (
          <span className={estilos.veu}>
            <span className={botoes.girando} />
          </span>
        ) : null}
      </button>

      <div className={`${estilos.linha} ${estilos.legenda}`}>
        <IconTile icone="file-text" {...LADRILHO_NEUTRO} />
        <div className={estilos.textos}>
          <p className={estilos.tituloDaReceita}>Receita anexada</p>
          <p className={estilos.ajudaDaReceita}>
            {prescritor ? `Receitada por ${prescritor}.` : 'Clique na imagem para ver de perto.'}
          </p>
        </div>
      </div>

      <div className={estilos.acoesDaReceita}>
        <button
          type="button"
          className={botoes.contorno}
          style={{ flex: 1, minHeight: 46 }}
          disabled={ocupado}
          onClick={onEscolher}
          aria-label="Trocar a foto da receita"
        >
          <Icone nome="refresh-cw" size={15} />
          Trocar
        </button>
        <button
          type="button"
          className={botoes.perigo}
          disabled={ocupado}
          onClick={onRemover}
          aria-label="Remover a foto da receita"
        >
          Remover
        </button>
      </div>

      <ImageViewer
        uri={foto}
        visivel={ampliada}
        descricao={`Receita de ${doQue}`}
        onClose={() => setAmpliada(false)}
      />
    </SurfaceCard>
  );
}

/**
 * A foto da caixinha em destaque, no topo do detalhe — como na tela de
 * referencia da web: miniatura grande com o selo da camera e uma legenda.
 *
 * Sem foto, o quadro e o convite para adicionar uma. Com foto, clicar amplia;
 * o selo da camera troca; "Remover" fica embaixo.
 */
export function FotoDoRemedio({
  foto,
  doQue,
  ocupada = null,
  legenda,
  onEscolher,
  onRemover,
}: PropsDaEmbalagem & { legenda?: string }) {
  const [ampliada, setAmpliada] = useState(false);
  const [falhou, setFalhou] = useState(false);
  useEffect(() => setFalhou(false), [foto]);

  const mostrarFoto = Boolean(foto) && !falhou;
  const inerte = ocupada !== null;

  return (
    <div className={estilos.destaque}>
      <div className={estilos.quadro}>
        <button
          type="button"
          className={estilos.quadroAlvo}
          disabled={inerte}
          onClick={() => (mostrarFoto ? setAmpliada(true) : onEscolher())}
          aria-label={
            mostrarFoto ? `Ampliar a foto da caixinha de ${doQue}` : 'Adicionar foto da caixinha'
          }
        >
          {mostrarFoto ? (
            <img src={foto!} alt="" onError={() => setFalhou(true)} />
          ) : (
            <span className={estilos.quadroVazio}>
              <Icone nome={falhou ? 'image' : 'camera'} size={34} />
              <span>{falhou ? 'Não consegui abrir a foto' : 'Adicionar foto da caixinha'}</span>
            </span>
          )}
          {inerte ? (
            <span className={estilos.veu}>
              <span className={botoes.girando} />
            </span>
          ) : null}
        </button>

        {mostrarFoto && !inerte ? (
          <button
            type="button"
            className={estilos.trocarFoto}
            onClick={onEscolher}
            aria-label="Trocar a foto da caixinha"
            title="Trocar a foto"
          >
            <Icone nome="camera" size={20} />
          </button>
        ) : null}
      </div>

      {legenda && mostrarFoto ? <p className={estilos.legendaDaFoto}>{legenda}</p> : null}

      {foto && !inerte ? (
        <button type="button" className={`${botoes.perigo} ${estilos.removerFoto}`} onClick={onRemover}>
          Remover foto
        </button>
      ) : null}

      <ImageViewer
        uri={foto ?? ''}
        visivel={ampliada && mostrarFoto}
        descricao={`Foto da caixinha de ${doQue}`}
        onClose={() => setAmpliada(false)}
      />
    </div>
  );
}
