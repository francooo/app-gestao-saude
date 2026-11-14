import { Icone } from './Icone';
import estilos from './Selo.module.css';

type Tom = 'sucesso' | 'atencao' | 'erro' | 'neutro';

const ICONE: Record<Tom, string> = {
  sucesso: 'check-circle',
  atencao: 'alert-circle',
  erro: 'alert-triangle',
  neutro: 'info',
};

/**
 * Pilula de status. Leva SEMPRE icone e texto: a cor sozinha nao diz nada a
 * quem nao a distingue.
 */
export function SeloDeStatus({
  tom,
  children,
  icone,
}: {
  tom: Tom;
  children: string;
  /** Troca o icone padrao do tom. */
  icone?: string;
}) {
  return (
    <span className={estilos.selo} data-tom={tom}>
      <Icone nome={icone ?? ICONE[tom]} size={16} />
      {children}
    </span>
  );
}

/** Barra de nivel: quanto resta (0 a 1). Decorativa — o numero vem escrito ao lado. */
export function BarraDeProgresso({ nivel, baixo = false }: { nivel: number; baixo?: boolean }) {
  const fracao = Math.max(0, Math.min(1, nivel));
  return (
    <span className={estilos.trilho} aria-hidden="true">
      <span
        className={estilos.barra}
        data-baixo={baixo ? '' : undefined}
        style={{ width: `${Math.round(fracao * 100)}%` }}
      />
    </span>
  );
}

/** Campo de busca em pilula, com a lupa. */
export function CampoDeBusca({
  valor,
  onChange,
  placeholder,
  rotulo,
}: {
  valor: string;
  onChange: (texto: string) => void;
  placeholder: string;
  /** Nome do campo para o leitor de tela. */
  rotulo: string;
}) {
  return (
    <label className={estilos.busca}>
      <Icone nome="search" size={20} />
      <span className="so-leitor-de-tela">{rotulo}</span>
      <input
        type="search"
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
    </label>
  );
}
