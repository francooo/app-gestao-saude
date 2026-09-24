import { Alert } from 'react-native';

import { healthApi, type Dose, type Medication } from '@/api/health';
import { estadoHoje, hora, slotAlvo, tituloDoMedicamento } from '@/lib/posologia';

/**
 * O que um toque no botao de dose significa, e o que fazer a respeito.
 *
 * Vive aqui, e nao dentro de uma tela, porque agora sao DUAS telas que marcam
 * dose: a lista de remedios e o detalhe. Sao ~70 linhas de regra clinica
 * delicada — idempotencia, confirmacao antes de apagar registro, o horario
 * exato que a dose preenche. Duas copias divergem, e o dia em que divergirem
 * uma delas vai estar errada sobre um remedio de crianca.
 */

export type ResultadoDeDose =
  | { tipo: 'registrada'; dose: Dose }
  | { tipo: 'desfeita'; doseId: string }
  /** Nada a fazer: a pessoa cancelou, ou nao ha horario para preencher. */
  | { tipo: 'nada' };

/** Alert de confirmacao como promessa, para caber no fluxo com await. */
function confirmar(titulo: string, mensagem: string, rotulo: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(titulo, mensagem, [
      { text: 'Cancelar', style: 'cancel', onPress: () => resolve(false) },
      { text: rotulo, style: 'destructive', onPress: () => resolve(true) },
    ]);
  });
}

/**
 * Marca ou desfaz a dose de hoje.
 *
 * LANCA quando a requisicao falha, de proposito: quem chama e que sabe como
 * mostrar o erro e como desfazer o estado visual. E o estado da tela deve
 * virar SO depois do retorno, nunca antes — num aplicativo de remedio um
 * "tomado" falso e o pior resultado possivel. E tambem por isso que nao existe
 * fila para uso offline: se falhou, tem que parecer que falhou.
 */
export async function alternarDose(m: Medication, agora: Date): Promise<ResultadoDeDose> {
  const estado = estadoHoje(m, agora);
  const repetivel = m.scheduleType === 'as_needed';

  if (estado.tipo === 'tomado' && !repetivel) {
    // Desfazer pede confirmacao: e registro clinico, e um toque no bolso nao
    // pode apaga-lo.
    const confirmou = await confirmar(
      'Desfazer registro?',
      `A dose de ${tituloDoMedicamento(m)} das ${hora(estado.quando)} deixa de constar como tomada.`,
      'Desfazer',
    );
    if (!confirmou) return { tipo: 'nada' };

    await healthApi.deleteDose(m.id, estado.dose.id);
    return { tipo: 'desfeita', doseId: estado.dose.id };
  }

  // Sem horario previsto e sem ser "se necessario", nao ha o que registrar:
  // marcar criaria uma dose solta, fora de qualquer grade.
  const slot = repetivel ? null : slotAlvo(m, agora);
  if (!repetivel && !slot) return { tipo: 'nada' };

  const dose = await healthApi.registerDose(m.id, {
    scheduledFor: slot ? slot.toISOString() : null,
    takenAt: new Date().toISOString(),
    status: 'tomada',
  });

  return { tipo: 'registrada', dose };
}

/**
 * Aplica a dose sobre o medicamento em memoria.
 *
 * SUBSTITUI a dose de mesmo id em vez de somar: o POST do servidor e
 * idempotente, entao marcar duas vezes o mesmo horario devolve a MESMA dose, e
 * somar mostraria duas na tela.
 */
export function comDose(m: Medication, dose: Dose): Medication {
  return {
    ...m,
    doses: [...m.doses.filter((d) => d.id !== dose.id), dose],
    lastDoseAt: dose.takenAt ?? m.lastDoseAt,
  };
}

export function semDose(m: Medication, doseId: string): Medication {
  return { ...m, doses: m.doses.filter((d) => d.id !== doseId) };
}
