import type { Professional } from '@gestao/shared/api/health';
import { Link } from 'react-router';

import { Avatar } from './Avatar';
import estilos from './cartoesDeLista.module.css';
import { Icone } from './Icone';
import { StarRating } from './StarRating';

type Props = {
  doctor: Professional;
  /** Distancia ate o ponto de referencia, quando houver. */
  distanceKm?: number | null;
};

/**
 * Linha de um medico: foto, nome, especialidade, onde atende, a sua nota e o
 * botao "Agendar".
 *
 * O cartao inteiro leva a ficha; o botao leva a nova consulta. Como botao
 * dentro de link e HTML invalido, a ficha e um link em camada por tras.
 */
export function DoctorCard({ doctor, distanceKm }: Props) {
  const teleconsulta = doctor.defaultModality === 'teleconsulta';

  const contexto = [
    distanceKm != null ? `${distanceKm.toFixed(1).replace('.', ',')} km` : null,
    teleconsulta ? 'Teleconsulta' : doctor.clinicName || 'Consulta presencial',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={estilos.cartao}>
      <Link
        to={`/medico/${doctor.id}`}
        className={estilos.cobertura}
        aria-label={`${doctor.name}, ${doctor.specialty ?? 'sem especialidade'}`}
      />

      <Avatar nome={doctor.name} photo={doctor.photo} size={72} />

      <div className={estilos.meioDoMedico}>
        <div className={estilos.topo}>
          <p className={estilos.nomeGrande}>{doctor.name}</p>
          <Icone nome="chevron-right" size={20} />
        </div>

        <div className={estilos.corpo}>
          <div className={estilos.dados}>
            {doctor.specialty ? <p className={estilos.especialidade}>{doctor.specialty}</p> : null}

            <p className={estilos.linhaComIcone}>
              <Icone
                nome={teleconsulta ? 'video' : 'map-pin'}
                size={14}
                color="var(--cor-accent-green-soft)"
              />
              <span>{contexto}</span>
            </p>

            <StarRating value={doctor.myRating} size={15} />
          </div>

          <Link
            to={`/consulta/nova?professionalId=${doctor.id}`}
            className={`${estilos.acao} ${estilos.acima}`}
            data-tom={teleconsulta ? 'ambar' : undefined}
            aria-label={`Nova consulta com ${doctor.name}`}
          >
            Agendar
          </Link>
        </div>
      </div>
    </div>
  );
}
