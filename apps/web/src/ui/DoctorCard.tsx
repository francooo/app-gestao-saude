import type { Appointment, Professional } from '@gestao/shared/api/health';
import { hora } from '@gestao/shared/lib/posologia';
import { Link } from 'react-router';

import { Avatar } from './Avatar';
import estilos from './DoctorCard.module.css';
import { Icone } from './Icone';

type Props = {
  doctor: Professional;
  /** Distancia ate o ponto de referencia, quando houver. */
  distanceKm?: number | null;
  /** A proxima consulta marcada com este medico, se houver. */
  proximaConsulta?: Appointment | null;
  /** Favorito (coracao). Sem `onFavoritar`, o coracao nao aparece. */
  favorito?: boolean;
  onFavoritar?: () => void;
};

/** "Quarta, 28 de mai · 16:30" */
function quandoDaConsulta(iso: string): string {
  const d = new Date(iso);
  const dia = d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'short' });
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} · ${hora(d)}`;
}

/**
 * Cartao de um medico (mock 04 da repaginacao): retrato grande, nome,
 * especialidade, a proxima consulta e "Ver perfil".
 *
 * O retrato e a FOTO CADASTRADA ou as iniciais — nunca os retratos ilustrados
 * do mock, que sao dados de exemplo.
 */
export function DoctorCard({ doctor, distanceKm, proximaConsulta, favorito = false, onFavoritar }: Props) {
  const teleconsulta = doctor.defaultModality === 'teleconsulta';
  const onde = [
    distanceKm != null ? `${distanceKm.toFixed(1).replace('.', ',')} km` : null,
    teleconsulta ? 'Teleconsulta' : doctor.clinicName || null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className={estilos.cartao} aria-label={doctor.name}>
      {onFavoritar ? (
        <button
          type="button"
          className={estilos.favorito}
          aria-pressed={favorito}
          aria-label={favorito ? `Tirar ${doctor.name} dos favoritos` : `Marcar ${doctor.name} como favorito`}
          onClick={onFavoritar}
        >
          <Icone nome="heart" size={26} />
        </button>
      ) : null}

      <div className={estilos.retrato}>
        <Avatar nome={doctor.name} photo={doctor.photo ?? undefined} size={120} />
      </div>

      <h3 className={estilos.nome}>{doctor.name}</h3>
      <p className={estilos.especialidade}>{doctor.specialty || 'Sem especialidade'}</p>
      {onde ? (
        <p className={estilos.onde}>
          <Icone nome={teleconsulta ? 'video' : 'map-pin'} size={14} />
          {onde}
        </p>
      ) : null}

      <div className={estilos.consulta}>
        <span className={estilos.consultaIcone} aria-hidden="true">
          <Icone nome="calendar" size={22} />
        </span>
        {proximaConsulta ? (
          <span className={estilos.consultaTextos}>
            <span className={estilos.consultaRotulo}>Próxima consulta</span>
            <span className={estilos.consultaValor}>{quandoDaConsulta(proximaConsulta.scheduledAt)}</span>
          </span>
        ) : (
          <span className={estilos.consultaTextos}>
            <span className={estilos.consultaRotulo}>Nenhuma consulta marcada</span>
            <Link to={`/consulta/nova?professionalId=${doctor.id}`} className={estilos.agendar}>
              Agendar consulta
            </Link>
          </span>
        )}
      </div>

      <Link to={`/medico/${doctor.id}`} className={estilos.verPerfil}>
        Ver perfil
        <Icone nome="chevron-right" size={18} />
      </Link>
    </article>
  );
}

/** O ultimo cartao da grade: terracota, "Adicionar medico". */
export function AdicionarMedicoCard() {
  return (
    <Link to="/medico/novo" className={estilos.adicionar}>
      <span className={estilos.adicionarIcone} aria-hidden="true">
        <Icone nome="user-plus" size={36} />
      </span>
      <span className={estilos.adicionarTitulo}>Adicionar médico</span>
      <span className={estilos.adicionarTexto}>Inclua um novo profissional no cuidado da sua família.</span>
      <span className={estilos.adicionarBotao}>
        Adicionar
        <Icone nome="chevron-right" size={18} />
      </span>
    </Link>
  );
}
