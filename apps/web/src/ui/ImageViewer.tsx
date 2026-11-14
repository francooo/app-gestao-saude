import { useEffect, useRef } from 'react';

import { Icone } from './Icone';
import estilos from './ImageViewer.module.css';

type Props = {
  uri: string;
  visivel: boolean;
  descricao: string;
  onClose: () => void;
};

/** Foto em tela cheia sobre o veu escuro. Fecha com Esc, com o X ou clicando fora. */
export function ImageViewer({ uri, visivel, descricao, onClose }: Props) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (visivel && !el.open) el.showModal();
    if (!visivel && el.open) el.close();
  }, [visivel]);

  return (
    <dialog
      ref={ref}
      className={estilos.visualizador}
      aria-label={descricao}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {visivel ? (
        <>
          <img src={uri} alt={descricao} className={estilos.imagem} />
          <button type="button" className={estilos.fechar} onClick={onClose} aria-label="Fechar">
            <Icone nome="x" size={24} />
          </button>
        </>
      ) : null}
    </dialog>
  );
}
