import { isSameDay, startOfDay } from 'date-fns';

import type { Appointment, Medication, Profile } from '@/api/health';
import { idadeDescrita } from '@/lib/pessoa';
import { hora, posologia, proximaDose, vigenteHoje } from '@/lib/posologia';

/**
 * Monta o bloco de texto que o assistente recebe sobre a pessoa.
 *
 * Por que aqui e nao no servidor: o servidor roda em UTC e nao tem opiniao
 * sobre fuso — "proxima dose" depende do relogio deste aparelho, e
 * posologia.ts, que sabe calcular isso, e do aplicativo. Recalcular la seria
 * uma segunda implementacao do mesmo calculo, divergindo com o tempo.
 *
 * O texto e simples de proposito: rotulos curtos e uma linha por item. O
 * modelo le isso como DADO, nunca como instrucao — o texto de sistema no
 * servidor diz isso explicitamente, porque observacoes de remedio sao texto
 * livre escrito pela familia.
 */

/** Teto do bloco. O servidor recusa acima de 8000; paramos antes com folga. */
const TETO = 6_000;

/** Quantos nomes da familia cabem no bloco antes de valer mais uma consulta. */
const MAXIMO_DE_NOMES = 8;

export function montarContexto(
  perfil: Profile | null,
  medicamentos: Medication[],
  consultas: Appointment[],
  agora: Date,
  /** A familia inteira, para o bloco dizer quem mais existe. */
  todosOsPerfis: Profile[] = [],
): string | null {
  // Sem pessoa escolhida o bloco NAO e mais nulo: a lista da familia sozinha
  // ja evita uma chamada de ferramenta so para descobrir quem mora na casa.
  if (!perfil) {
    const lista = outrasPessoas(null, todosOsPerfis);
    return lista ?? null;
  }

  const linhas: string[] = [];

  /**
   * Um rotulo por linha, e o que FALTA dito com todas as letras.
   *
   * Antes isto era uma frase so, montada com `.filter(Boolean)`: peso ausente
   * simplesmente sumia, e o resultado PARECIA completo. Foi assim que o
   * assistente afirmou nao ter um peso que estava no banco — ele nao viu
   * lacuna nenhuma para desconfiar.
   */
  linhas.push(`Nome: ${perfil.fullName}`);
  linhas.push(`Idade: ${idadeDescrita(perfil.birthDate) ?? 'data de nascimento não cadastrada'}`);
  linhas.push(
    perfil.weightKg != null
      ? `Peso: ${perfil.weightKg} kg${anotadoEm(perfil.weightMeasuredAt)}`
      : 'Peso: não cadastrado',
  );
  linhas.push(
    perfil.heightCm != null ? `Altura: ${perfil.heightCm} cm` : 'Altura: não cadastrada',
  );

  if (perfil.notes?.trim()) linhas.push(`Observações da família: ${perfil.notes.trim()}`);

  // --- Remedios ---------------------------------------------------------
  const dela = medicamentos.filter((m) => m.profileId === perfil.id && vigenteHoje(m, agora));

  if (dela.length === 0) {
    linhas.push('\nRemédios ativos: nenhum cadastrado.');
  } else {
    linhas.push('\nRemédios ativos:');
    for (const m of dela) {
      const nome = [m.name, m.strength].filter(Boolean).join(' ');
      const partes = [`- ${nome}: ${posologia(m)}`];

      const proxima = proximaDose(m, agora);
      if (proxima) {
        partes.push(
          isSameDay(proxima, agora)
            ? `Próxima dose hoje ${hora(proxima)}.`
            : `Próxima dose amanhã ${hora(proxima)}.`,
        );
      } else if (m.scheduleType === 'as_needed') {
        partes.push('Tomar só se necessário.');
      }

      const tomadasHoje = m.doses.filter(
        (d) => d.status === 'tomada' && d.takenAt && isSameDay(new Date(d.takenAt), agora),
      );
      if (tomadasHoje.length > 0) {
        const ultima = tomadasHoje.at(-1)!;
        partes.push(`Já tomou hoje às ${hora(new Date(ultima.takenAt!))}.`);
      }

      if (m.prescriberName) partes.push(`Receitado por ${m.prescriberName}.`);
      if (m.instructions?.trim()) partes.push(`Orientação: ${m.instructions.trim()}`);

      linhas.push(partes.join(' '));
    }
  }

  // --- Consultas --------------------------------------------------------
  const futuras = consultas
    .filter((c) => c.profileId === perfil.id && new Date(c.scheduledAt) >= startOfDay(agora))
    .slice(0, 5);

  if (futuras.length === 0) {
    linhas.push('\nPróximas consultas: nenhuma agendada.');
  } else {
    linhas.push('\nPróximas consultas:');
    for (const c of futuras) {
      const quando = new Date(c.scheduledAt);
      const data = quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      const onde = c.location ?? (c.modality === 'teleconsulta' ? 'teleconsulta' : null);
      linhas.push(
        `- ${data} às ${hora(quando)}${c.professionalName ? `, ${c.professionalName}` : ''}` +
          `${c.professionalSpecialty ? ` (${c.professionalSpecialty})` : ''}` +
          `${onde ? `, ${onde}` : ''}.`,
      );
    }
  }

  // A lista da familia vai POR ULTIMO de proposito: se o corte abaixo tiver
  // que morder alguma coisa, que morda os nomes e nao os remedios.
  const outras = outrasPessoas(perfil, todosOsPerfis);
  if (outras) linhas.push(outras);

  const texto = linhas.join('\n');
  // Corta com aviso, em vez de deixar o servidor recusar a pergunta inteira.
  return texto.length <= TETO ? texto : `${texto.slice(0, TETO)}\n[lista truncada]`;
}

/** "(anotado em 12/06)". Vazio quando a medicao e antiga demais para ter data. */
function anotadoEm(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ''
    : ` (anotado em ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })})`;
}

/**
 * Quem mais mora na casa — so nome e idade.
 *
 * Existe por causa de um defeito medido: perguntaram o peso de uma pessoa
 * enquanto OUTRA estava escolhida no seletor, e o assistente respondeu que o
 * dado nao existia, sem consultar nada. Saber que a pessoa EXISTE e o empurrao
 * que faltava para ele ir buscar.
 *
 * NAO leva peso, e isso e deliberado: com nome, idade e peso aqui, ele
 * calcularia dose direto do bloco e pularia a ficha — que e onde esta a data
 * da medicao e o aviso do que falta. Idade basta para identificar quem e.
 */
function outrasPessoas(atual: Profile | null, todos: Profile[]): string | null {
  const outros = todos.filter((p) => p.isActive !== false && p.id !== atual?.id);
  if (outros.length === 0) return null;

  const cabecalho = atual
    ? '\nOUTRAS PESSOAS DESTA CONTA (só nome e idade; todo o resto está nas ferramentas)'
    : '\nPESSOAS DESTA CONTA (só nome e idade; todo o resto está nas ferramentas)';

  const linhas = outros.slice(0, MAXIMO_DE_NOMES).map((p) => {
    const parentesco = p.relationship ? ` (${p.relationship})` : '';
    return `- ${p.fullName}${parentesco}, ${idadeDescrita(p.birthDate) ?? 'idade não cadastrada'}`;
  });

  if (outros.length > MAXIMO_DE_NOMES) {
    linhas.push(`- e mais ${outros.length - MAXIMO_DE_NOMES} — use listar_perfis para a lista completa.`);
  }

  return [cabecalho, ...linhas].join('\n');
}
