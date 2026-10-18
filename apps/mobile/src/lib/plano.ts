import type { Plano } from '@/api/conta';
import { diaCurto } from '@/lib/posologia';

/**
 * Os textos do plano, num lugar so.
 *
 * A linha de Ajustes e o cartao da tela de assinatura dizem a mesma coisa em
 * tamanhos diferentes; escritos em dois lugares, um dia um diria "Teste ate
 * 25/10" e o outro "Gratuito" para a mesma conta.
 *
 * Modulo PURO, como avisos.ts: entra o plano, sai texto.
 */

/** "25/10", ou nulo se a data nao vier ou nao for valida. */
function dia(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : diaCurto(d);
}

/**
 * A segunda linha de Ajustes: "Teste até 25/10", "Ativa", "Gratuito".
 *
 * Sem plano (servidor antigo ou falha), nada — a linha reserva a altura e nao
 * afirma um estado que o aplicativo nao sabe.
 */
export function resumoDoPlano(plano: Plano | null): string | undefined {
  if (!plano) return undefined;
  if (plano.motivo === 'assinatura') return 'Ativa';
  if (plano.motivo === 'teste') {
    const ate = dia(plano.ate);
    return ate ? `Teste até ${ate}` : 'Teste grátis';
  }
  return 'Gratuito';
}

/** Titulo e apoio do cartao de estado, na tela de assinatura. */
export function estadoDoPlano(plano: Plano | null): { titulo: string; apoio: string } {
  if (!plano) {
    return {
      titulo: 'Não consegui confirmar seu plano',
      apoio: 'Confira sua internet e toque em "Já assinei" para tentar de novo.',
    };
  }

  if (plano.motivo === 'assinatura') {
    const ate = dia(plano.ate);
    return {
      titulo: ate ? `Assinante até ${ate}` : 'Assinatura ativa',
      apoio: 'Todos os recursos estão liberados.',
    };
  }

  if (plano.motivo === 'teste') {
    const ate = dia(plano.ate);
    return {
      titulo: ate ? `Teste grátis até ${ate}` : 'Teste grátis',
      apoio: 'Durante o teste, todos os recursos estão liberados.',
    };
  }

  const fimDoTeste = dia(plano.testeAte);
  return {
    titulo: 'Plano gratuito',
    apoio: fimDoTeste
      ? `Seu teste terminou em ${fimDoTeste}.`
      : 'Os recursos de inteligência artificial fazem parte da assinatura.',
  };
}
