import type { ButtonHTMLAttributes } from 'react';

import estilos from './PrimaryButton.module.css';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  title: string;
  loading?: boolean;
  /**
   * Cor do botao. Padrao ambar (acao principal). "terracota" e o Salvar do
   * diario de sintomas.
   */
  tom?: 'ambar' | 'terracota';
};

/** O botao preenchido — o primeiro dos tres degraus (preenchido, contornado, texto). */
export function PrimaryButton({
  title,
  loading = false,
  disabled = false,
  tom = 'ambar',
  type = 'button',
  className,
  ...resto
}: Props) {
  return (
    <button
      type={type}
      className={[estilos.botao, className].filter(Boolean).join(' ')}
      data-tom={tom}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...resto}
    >
      {loading ? (
        <>
          <span className={estilos.girando} aria-hidden="true" />
          <span className="so-leitor-de-tela">{title}</span>
        </>
      ) : (
        title
      )}
    </button>
  );
}
