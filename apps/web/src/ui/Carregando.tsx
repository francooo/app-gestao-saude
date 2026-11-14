import estilos from './Carregando.module.css';

type Props = {
  /** Ocupa a janela inteira, sobre o verde do fundo: abertura e troca de tela. */
  telaCheia?: boolean;
  rotulo?: string;
};

export function Carregando({ telaCheia = false, rotulo = 'Carregando' }: Props) {
  return (
    <div className={telaCheia ? estilos.telaCheia : estilos.bloco} role="status">
      <span className={estilos.girando} aria-hidden="true" />
      <span className="so-leitor-de-tela">{rotulo}</span>
    </div>
  );
}
