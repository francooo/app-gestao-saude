import type { Medication } from '@gestao/shared/api/health';
import {
  diaCurto,
  estadoHoje,
  formaVisual,
  hora,
  posologia,
  tituloDoMedicamento,
} from '@gestao/shared/lib/posologia';
import { addDays, isSameDay } from 'date-fns';
import { Link } from 'react-router';

import { Avatar } from './Avatar';
import estilos from './cartoesDeLista.module.css';
import { DoseButton } from './DoseButton';
import { Icone } from './Icone';
import { IconTile, LADRILHO_POR_FORMA } from './IconTile';

type Props = {
  medicamento: Medication;
  /** Fixado por quem chama a cada carga, para a tela nao discordar de si mesma. */
  agora: Date;
  /** Mostra o avatar de quem toma. Desligue quando a secao ja diz de quem e. */
  mostrarPerfil?: boolean;
  /** Com isto o cartao ganha o botao de marcar a dose. */
  onMarcar?: () => void;
  enviando?: boolean;
  /** O cartao e o que esta aberto no painel de detalhe (tela larga). */
  atual?: boolean;
};

/**
 * Linha de um remedio: ladrilho da forma, nome, posologia e a situacao de hoje.
 *
 * O cartao inteiro leva ao detalhe. Como o botao de dose nao pode morar dentro
 * de um link, o link e uma camada por tras e o botao fica acima dela.
 */
export function MedicationCard({
  medicamento: m,
  agora,
  mostrarPerfil = false,
  onMarcar,
  enviando = false,
  atual = false,
}: Props) {
  const estado = estadoHoje(m, agora);
  const visual = LADRILHO_POR_FORMA[formaVisual(m.form)];
  const titulo = tituloDoMedicamento(m);
  const status = linhaDeStatus(estado, agora);

  const repetivel = m.scheduleType === 'as_needed';
  const marcado = estado.tipo === 'tomado' && !repetivel;
  const semAcao =
    estado.tipo === 'inativo' || estado.tipo === 'encerrado' || estado.tipo === 'nao_comecou';

  return (
    <div className={estilos.cartao} data-atual={atual ? '' : undefined}>
      <Link
        to={`/remedios/${m.id}`}
        className={estilos.cobertura}
        aria-label={`${titulo}, ${posologia(m)}. ${status.texto}`}
        aria-current={atual ? 'page' : undefined}
      />

      <IconTile {...visual} size={54} />

      <div className={estilos.meio}>
        <p className={estilos.nome}>{titulo}</p>
        <p className={estilos.apoio}>{posologia(m)}</p>
        <p className={estilos.status} style={{ color: status.cor }}>
          <Icone nome={status.icone} size={13} />
          <span>{status.texto}</span>
        </p>
      </div>

      <div className={estilos.direita}>
        {onMarcar ? (
          <DoseButton
            className={estilos.acima}
            checked={marcado}
            repetivel={repetivel}
            disabled={semAcao}
            enviando={enviando}
            label={rotuloDaDose(titulo, estado, repetivel)}
            onClick={onMarcar}
          />
        ) : null}
        {mostrarPerfil && m.profileName ? (
          <Avatar nome={m.profileName} color={m.profileColor ?? undefined} size={38} />
        ) : null}
      </div>
    </div>
  );
}

type Estado = ReturnType<typeof estadoHoje>;
type Status = { icone: string; texto: string; cor: string };

const SECUNDARIO = 'var(--cor-text-secondary)';

function quandoRelativo(quando: Date, agora: Date): string {
  if (isSameDay(quando, agora)) return hora(quando);
  if (isSameDay(quando, addDays(agora, 1))) return `amanhã ${hora(quando)}`;
  return `${diaCurto(quando)} ${hora(quando)}`;
}

function linhaDeStatus(estado: Estado, agora: Date): Status {
  switch (estado.tipo) {
    case 'tomado':
      return {
        icone: 'check-circle',
        cor: 'var(--cor-dose-taken)',
        texto:
          estado.quantas > 1
            ? `${estado.quantas} doses hoje · última às ${hora(estado.quando)}`
            : `Tomado hoje às ${hora(estado.quando)}`,
      };
    case 'pendente':
      return {
        icone: 'clock',
        cor: SECUNDARIO,
        texto: `Próxima dose ${quandoRelativo(estado.quando, agora)}`,
      };
    case 'se_necessario':
      return { icone: 'info', cor: SECUNDARIO, texto: 'Somente se necessário' };
    case 'nao_comecou':
      return { icone: 'calendar', cor: SECUNDARIO, texto: `Começa em ${diaCurto(estado.em)}` };
    case 'encerrado':
      return { icone: 'flag', cor: SECUNDARIO, texto: `Encerrado em ${diaCurto(estado.em)}` };
    case 'inativo':
      return { icone: 'pause-circle', cor: SECUNDARIO, texto: 'Tratamento pausado' };
    default:
      return { icone: 'clock', cor: SECUNDARIO, texto: 'Sem dose prevista hoje' };
  }
}

function rotuloDaDose(titulo: string, estado: Estado, repetivel: boolean): string {
  if (repetivel) return `Registrar uma dose de ${titulo} agora`;
  if (estado.tipo === 'tomado') return `Dose de ${titulo}, tomada às ${hora(estado.quando)}`;
  if (estado.tipo === 'pendente') return `Dose de ${titulo} das ${hora(estado.quando)}`;
  return `Dose de ${titulo}`;
}
