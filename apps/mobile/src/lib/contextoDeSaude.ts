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

export function montarContexto(
  perfil: Profile | null,
  medicamentos: Medication[],
  consultas: Appointment[],
  agora: Date,
): string | null {
  if (!perfil) return null;

  const linhas: string[] = [];

  const idade = idadeDescrita(perfil.birthDate);
  const identidade = [
    `Nome: ${perfil.fullName}`,
    idade,
    perfil.weightKg != null ? `${perfil.weightKg} kg` : null,
    perfil.heightCm != null ? `${perfil.heightCm} cm` : null,
  ]
    .filter(Boolean)
    .join(', ');
  linhas.push(identidade);

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

  const texto = linhas.join('\n');
  // Corta com aviso, em vez de deixar o servidor recusar a pergunta inteira.
  return texto.length <= TETO ? texto : `${texto.slice(0, TETO)}\n[lista truncada]`;
}
