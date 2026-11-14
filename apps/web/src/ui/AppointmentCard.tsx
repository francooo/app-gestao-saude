import type { Appointment } from '@gestao/shared/api/health';
import { hora } from '@gestao/shared/lib/posologia';
import type { ReactNode } from 'react';
import { Link } from 'react-router';

import { Avatar } from './Avatar';
import estilos from './cartoesDeLista.module.css';
import { Icone } from './Icone';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "23 jun", como no aplicativo: sem o "de" e sem o ponto do formato do navegador. */
function dataCurta(d: Date): string {
  return `${d.getDate()} ${MESES[d.getMonth()]}`;
}

/**
 * Linha de uma consulta: com quem, quando e onde.
 *
 * Nao ha tela de detalhe de consulta. Com medico vinculado, a ficha dele e o
 * destino util; sem ele, o cartao fica inerte — melhor que um aviso de "em
 * construcao".
 */
export function AppointmentCard({ consulta: c }: { consulta: Appointment }) {
  const quando = new Date(c.scheduledAt);
  const medico = c.professionalName ?? c.title ?? 'Consulta';
  const especialidade = c.professionalSpecialty ?? c.profileName ?? '';
  // "Consulta presencial · Clinica Vida". Sem local, so o tipo.
  const tipo = c.modality === 'teleconsulta' ? 'Teleconsulta' : 'Consulta presencial';
  const local = c.location?.trim() ? `${tipo} · ${c.location.trim()}` : tipo;

  const conteudo: ReactNode = (
    <>
      <Avatar nome={medico} size={56} />

      <div className={estilos.meio} style={{ marginRight: c.professionalId ? undefined : 0 }}>
        <p className={estilos.nomeGrande}>{medico}</p>
        {especialidade ? <p className={estilos.especialidade}>{especialidade}</p> : null}

        {/* Como no mockup: o icone fica FORA da pilula, que leva so o texto. */}
        <p className={estilos.selos}>
          <Icone nome="calendar" size={15} />
          <span className={estilos.selo}>{dataCurta(quando)}</span>
          <Icone nome="clock" size={15} />
          <span className={estilos.selo}>{hora(quando)}</span>
        </p>

        <p className={estilos.local}>
          <Icone nome="map-pin" size={15} />
          <span>{local}</span>
        </p>
      </div>

      {c.professionalId ? <Icone nome="chevron-right" size={20} className={estilos.seta} /> : null}
    </>
  );

  const rotulo = `${medico}${especialidade ? `, ${especialidade}` : ''}, ${dataCurta(quando)} às ${hora(quando)}. ${local}.`;

  return c.professionalId ? (
    <Link to={`/medico/${c.professionalId}`} className={estilos.cartao} aria-label={rotulo}>
      {conteudo}
    </Link>
  ) : (
    <div className={estilos.cartao}>{conteudo}</div>
  );
}
