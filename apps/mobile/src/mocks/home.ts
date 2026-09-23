/**
 * ============================================================================
 * DADOS DE DEMONSTRACAO — NAO SAO REAIS
 * ============================================================================
 *
 * Existem para validar o layout da tela inicial no aparelho antes de construir
 * os dominios de verdade. Nenhum destes dados vem do banco.
 *
 * ATENCAO: este e um app de saude. "Amoxicilina 500mg" e uma posologia
 * inventada. Se estes dados chegarem a um usuario real acreditando serem seus,
 * o dano e concreto. Por isso:
 *   - tudo mora AQUI, e nao espalhado pelos componentes;
 *   - a tela inicial mostra uma faixa "Dados de demonstracao" enquanto este
 *     modulo estiver em uso.
 *
 * PARA REMOVER, e preciso existir antes:
 *   1. tabela de perfis da familia + endpoint de listagem;
 *   2. tabela de medicamentos com posologia e registro de doses;
 *   3. tabela de consultas com profissionais e agenda.
 *
 * Feito isso: apague este arquivo, troque quem passa as props em
 * app/(app)/inicio.tsx e remova a faixa de aviso.
 * ============================================================================
 */

import type { Appointment } from '@/components/AppointmentCard';

/**
 * true enquanto a tela usar este modulo. Controla a faixa de aviso.
 *
 * Medicamentos e MEMBROS DA FAMILIA ja sairam daqui — as duas telas leem
 * dados de verdade. Falta so as consultas.
 */
export const USANDO_DADOS_DE_EXEMPLO = true;

export const CONSULTAS_EXEMPLO: Appointment[] = [
  {
    id: 'c1',
    medico: 'Dra. Ana Costa',
    especialidade: 'Pediatria',
    data: '23 jun',
    hora: '09:00',
    local: 'Consulta presencial · Clínica Vida',
  },
];
