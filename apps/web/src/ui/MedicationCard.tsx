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

import {
  dataDeTermino,
  diaPorExtenso,
  estoqueBaixo,
  quantidadeDoEstoque,
} from '@gestao/shared/lib/estoque';

import { Avatar } from './Avatar';
import estilos from './cartoesDeLista.module.css';
import { DoseButton } from './DoseButton';
import { Icone } from './Icone';
import { IconTile, LADRILHO_POR_FORMA } from './IconTile';
import linha from './LinhaDeRemedio.module.css';
import { SeloDeStatus } from './Selo';

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

/**
 * O remedio em LINHA LARGA, para a lista de Medicamentos em tela de computador:
 * ladrilho, nome e pessoa; estoque e previsao de termino no meio; selo de
 * estoque e botao de dose a direita; e um rodape com o medico da receita e o
 * "Ver detalhes".
 *
 * Mesmas regras do MedicationCard (status do dia, botao de dose). O link cobre
 * a linha inteira por tras, porque o botao de dose nao pode morar dentro dele.
 */
export function MedicationRow({
  medicamento: m,
  agora,
  mostrarPerfil = false,
  onMarcar,
  enviando = false,
}: Omit<Props, 'atual'>) {
  const estado = estadoHoje(m, agora);
  const visual = LADRILHO_POR_FORMA[formaVisual(m.form)];
  const titulo = tituloDoMedicamento(m);
  const status = linhaDeStatus(estado, agora);

  const repetivel = m.scheduleType === 'as_needed';
  const marcado = estado.tipo === 'tomado' && !repetivel;
  const semAcao =
    estado.tipo === 'inativo' || estado.tipo === 'encerrado' || estado.tipo === 'nao_comecou';

  const estoque = m.stock ?? null;
  const baixo = estoque ? estoqueBaixo(m, estoque) : false;
  const termino = estoque ? dataDeTermino(m, estoque, agora) : null;

  return (
    <div className={linha.linha}>
      <Link
        to={`/remedios/${m.id}`}
        className={estilos.cobertura}
        aria-label={`${titulo}${m.profileName ? `, de ${m.profileName}` : ''}. ${status.texto}`}
      />

      <div className={linha.corpo}>
        <IconTile {...visual} size={64} />

        <div className={linha.nome}>
          <p className={linha.titulo}>{titulo}</p>
          {mostrarPerfil && m.profileName ? (
            <p className={linha.dado}>
              <Icone nome="user" size={16} />
              {m.profileName}
            </p>
          ) : (
            <p className={linha.dado}>{posologia(m)}</p>
          )}
        </div>

        <div className={linha.meio}>
          {estoque ? (
            <>
              <p className={linha.dado}>
                <Icone nome="mci:pill" size={16} />
                {quantidadeDoEstoque(estoque.remaining, m.form)} restantes
              </p>
              <p className={linha.dado}>
                <Icone nome="clock" size={16} />
                {termino
                  ? `Previsão de término: ${diaPorExtenso(termino, agora)}`
                  : posologia(m)}
              </p>
            </>
          ) : (
            <>
              <p className={linha.dado}>
                <Icone nome="repeat" size={16} />
                {posologia(m)}
              </p>
              <p className={linha.dado} style={{ color: status.cor }}>
                <Icone nome={status.icone} size={16} />
                {status.texto}
              </p>
            </>
          )}
        </div>

        <div className={`${linha.direita} ${estilos.acima}`}>
          {estoque ? (
            <SeloDeStatus tom={baixo ? 'atencao' : 'sucesso'}>
              {baixo ? 'Estoque baixo' : 'Estoque suficiente'}
            </SeloDeStatus>
          ) : null}
          {onMarcar ? (
            <DoseButton
              checked={marcado}
              repetivel={repetivel}
              disabled={semAcao}
              enviando={enviando}
              label={rotuloDaDose(titulo, estado, repetivel)}
              onClick={onMarcar}
            />
          ) : null}
        </div>
      </div>

      <div className={linha.rodape}>
        <span className={linha.receita}>
          {/* A lista nao traz a foto da receita (pesaria demais); o medico que
              receitou e o que ela sabe dizer sem abrir o remedio. */}
          {m.prescriberName ? (
            <>
              <Icone nome="file-text" size={16} />
              Receita de {m.prescriberName}
            </>
          ) : estoque ? (
            <>
              <Icone nome={status.icone} size={16} />
              {status.texto}
            </>
          ) : null}
        </span>
        <span className={linha.verDetalhes} aria-hidden="true">
          Ver detalhes
          <Icone nome="chevron-right" size={16} />
        </span>
      </div>
    </div>
  );
}
