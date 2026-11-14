import estilos from './Logo.module.css';

type Props = {
  /** 'empilhado': simbolo em cima do nome (menu, login). 'simbolo': so o coracao. */
  formato?: 'empilhado' | 'simbolo';
  /** Altura do simbolo, em px. O nome acompanha. */
  tamanho?: number;
  className?: string;
};

/**
 * A marca "Familia Saude": o coracao que nasce de duas folhas.
 *
 * Redesenhada em vetor a partir do recorte do pacote de telas (que e um PNG
 * pequeno, com fundo creme). O pacote avisa que este logo e um CONCEITO: se
 * chegar o arquivo oficial, e so trocar os caminhos abaixo.
 */
export function Logo({ formato = 'empilhado', tamanho = 44, className }: Props) {
  const simbolo = (
    <svg
      viewBox="0 0 64 64"
      width={tamanho}
      height={tamanho}
      aria-hidden="true"
      className={estilos.simbolo}
    >
      {/* As duas folhas, por tras do coracao. */}
      <path d="M32 60C19 58 8 47 8 31c12 2 22 12 24 29Z" fill="#4c7745" />
      <path d="M32 60c13-2 24-13 24-29-12 2-22 12-24 29Z" fill="#a4bd88" />
      {/* O coracao. */}
      <path
        d="M32 42C13 30 11 14 22 10.8c5-1.5 9 1.4 10 5.2 1-3.8 5-6.700 10-5.200C53 14 51 30 32 42Z"
        fill="#5f8c50"
      />
      {/* O coracao de dentro, so o contorno. */}
      <path
        d="M32 32.500c-7.400-4.800-7.900-10.600-4.200-11.700 2-.6 3.700.7 4.200 2.200.5-1.500 2.200-2.800 4.200-2.200 3.700 1.100 3.200 6.900-4.200 11.700Z"
        fill="none"
        stroke="#f4f1dc"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );

  if (formato === 'simbolo') {
    return (
      <span className={className} role="img" aria-label="Família Saúde">
        {simbolo}
      </span>
    );
  }

  return (
    <span className={[estilos.logo, className].filter(Boolean).join(' ')}>
      {simbolo}
      <span className={estilos.nome} style={{ fontSize: Math.round(tamanho * 0.5) }}>
        Família Saúde
      </span>
    </span>
  );
}
