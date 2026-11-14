import { estadoDoPlano } from '@gestao/shared/lib/plano';
import { useEffect, useState } from 'react';

import { usePlano } from '@/api/consultas';
import botoes from '@/ui/botoes.module.css';
import { Carregando } from '@/ui/Carregando';
import { Icone } from '@/ui/Icone';
import { IconTile, LADRILHO_NEUTRO } from '@/ui/IconTile';
import { Pagina } from '@/ui/Pagina';
import { PrimaryButton } from '@/ui/PrimaryButton';
import { ScreenHeader } from '@/ui/ScreenHeader';
import { SectionHeader } from '@/ui/SectionHeader';
import { SurfaceCard } from '@/ui/SurfaceCard';

import estilos from './conta.module.css';

/**
 * O que a assinatura traz. Sao exatamente os tres recursos que o servidor
 * bloqueia — nenhum item promete o que o 403 nao cobre.
 */
const BENEFICIOS = [
  {
    icone: 'camera',
    titulo: 'Ler receita e caixinha por foto',
    texto: 'A IA lê a foto e preenche o cadastro do remédio para você conferir.',
  },
  {
    icone: 'mci:star-four-points',
    titulo: 'Descreva como tomar',
    texto: 'Escreva do seu jeito e a IA transforma em horários e doses.',
  },
  {
    icone: 'message-square',
    titulo: 'Assistente de Saúde',
    texto: 'Tire dúvidas sobre os remédios, doses e consultas da família.',
  },
];

/** O que nao depende de plano. Dito por extenso para ninguem achar que perde o basico. */
const GRATIS = ['Remédios', 'Lembretes', 'Consultas', 'Diário de sintomas', 'Estoque', 'Médicos'];

/**
 * Assinatura: o estado do plano e o que ele libera (/conta/assinatura).
 *
 * A COMPRA AINDA NAO EXISTE: ela vem pela Google Play, numa versao futura do
 * aplicativo. O botao fica visivel e desabilitado, dizendo isso — escondido, a
 * tela pareceria um beco sem saida. "Ja assinei" so reconsulta o servidor.
 */
export function Assinatura() {
  const { plano, premium, carregado, recarregar } = usePlano();
  const [conferindo, setConferindo] = useState(false);
  /** A pessoa clicou em "Ja assinei" e a resposta voltou. */
  const [conferido, setConferido] = useState(false);

  // A cada entrada: o plano pode ter mudado (o teste venceu, alguem assinou
  // pelo celular), e a consulta da conta vale por cinco minutos.
  useEffect(() => {
    void recarregar();
  }, [recarregar]);

  async function jaAssinei() {
    setConferindo(true);
    try {
      await recarregar();
    } finally {
      setConferindo(false);
      setConferido(true);
    }
  }

  const assinante = plano?.motivo === 'assinatura';
  const estado = estadoDoPlano(plano);
  const liberado = premium && plano != null;

  return (
    <Pagina area="settings">
      <ScreenHeader title="Assinatura" voltar="historico" />

      {!carregado && !plano ? (
        <Carregando />
      ) : (
        <SurfaceCard className={estilos.estado}>
          <IconTile
            size={54}
            icone={liberado ? 'mci:star-four-points' : 'lock'}
            {...(liberado
              ? { fundo: 'var(--cor-accent-green)', traco: 'var(--cor-on-accent)' }
              : LADRILHO_NEUTRO)}
          />
          <div className={estilos.linhaTextos}>
            <p className={estilos.estadoTitulo}>{estado.titulo}</p>
            <p className={estilos.estadoApoio}>{estado.apoio}</p>
          </div>
        </SurfaceCard>
      )}

      <section className={estilos.secao}>
        <SectionHeader title="Com a assinatura" />
        <SurfaceCard>
          <ul className={estilos.beneficios}>
            {BENEFICIOS.map((b) => (
              <li key={b.titulo}>
                <IconTile icone={b.icone} fundo="var(--cor-surface-warm)" traco="var(--cor-accent)" />
                <div className={estilos.linhaTextos}>
                  <p className={estilos.beneficioTitulo}>{b.titulo}</p>
                  <p className={estilos.beneficioTexto}>{b.texto}</p>
                </div>
              </li>
            ))}
          </ul>
        </SurfaceCard>
      </section>

      <section className={estilos.secao}>
        <SectionHeader title="Continua grátis" />
        <SurfaceCard>
          <ul className={estilos.chips}>
            {GRATIS.map((rotulo) => (
              <li key={rotulo}>
                <Icone nome="check" size={12} />
                {rotulo}
              </li>
            ))}
          </ul>
        </SurfaceCard>
      </section>

      {/* Quem ja assina nao precisa do convite nem do "Ja assinei". */}
      {assinante ? null : (
        <div className={estilos.assinar}>
          <PrimaryButton title="Em breve pela Google Play" disabled />
          <p className={estilos.explicacao}>
            A assinatura chega numa próxima versão do aplicativo do celular. Até lá, nada é
            cobrado.
          </p>

          <div className={`${estilos.centro} ${estilos.acaoDeTexto}`}>
            <button
              type="button"
              className={botoes.texto}
              onClick={() => void jaAssinei()}
              disabled={conferindo}
              aria-busy={conferindo || undefined}
            >
              {conferindo ? <span className={botoes.girando} /> : null}
              Já assinei
            </button>
          </div>

          {conferido && !conferindo && plano && !plano.premium ? (
            <p className={estilos.explicacao} role="status">
              Ainda não encontramos uma assinatura nesta conta.
            </p>
          ) : null}
        </div>
      )}
    </Pagina>
  );
}
