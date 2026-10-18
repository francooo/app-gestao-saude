import { z } from 'zod';

import { request } from '@/api/client';
import { fusoDoAparelho } from '@/lib/horaLocal';

/**
 * Acompanhantes: quem recebe os avisos de uma pessoa da familia pelo WhatsApp.
 *
 * Arquivo proprio, e nao dentro de conta.ts, porque aqui ha um CRUD inteiro
 * com tipos proprios; conta.ts e credencial e consentimento. A rota mora em
 * /api/me so por falta de vaga de funcao no servidor (ver o handler).
 */

export const acompanhanteSchema = z.object({
  id: z.uuid(),
  profileId: z.uuid(),
  /** Nome completo de quem e acompanhado — a tela mostra so o primeiro. */
  patientName: z.string(),
  fullName: z.string(),
  /** Ja normalizado pelo servidor, so digitos com DDI ("5511999991234"). */
  phone: z.string(),
  relationship: z.string().nullable(),
  notifyDose: z.boolean(),
  notifyLate: z.boolean(),
  notifyLowStock: z.boolean(),
  notifyTaken: z.boolean(),
  active: z.boolean(),
  invitedAt: z.string().nullable(),
});
export type Acompanhante = z.infer<typeof acompanhanteSchema>;

/** As quatro permissoes, na ordem em que as telas as mostram. */
export const PERMISSOES = ['notifyDose', 'notifyLate', 'notifyLowStock', 'notifyTaken'] as const;
export type Permissao = (typeof PERMISSOES)[number];
export type Permissoes = Record<Permissao, boolean>;

/**
 * O que aconteceu com o convite.
 *
 * O cadastro nunca falha por causa dele: o servidor grava o acompanhante e so
 * entao tenta mandar a mensagem. A tela precisa dizer qual dos tres foi.
 */
export type ResultadoDoConvite = 'enviada' | 'falha' | 'nao-configurado';

const listaSchema = z.object({
  caregivers: z.array(acompanhanteSchema),
  whatsappConfigurado: z.boolean(),
});

export type NovoAcompanhante = {
  profileId: string;
  fullName: string;
  phone: string;
  relationship?: string | null;
  active?: boolean;
} & Partial<Permissoes>;

export type MudancasNoAcompanhante = Partial<Omit<NovoAcompanhante, 'profileId'>>;

/**
 * O fuso vai em TODO POST e PATCH, e nao numa chamada separada.
 *
 * O agendador do servidor precisa saber quando e "08:00" da familia, e o
 * unico momento em que o aparelho fala com essa parte do servidor e aqui. Se
 * a pessoa viajar e salvar de novo, o fuso acompanha.
 */
function comFuso<T extends object>(corpo: T): T & { fuso?: string } {
  const fuso = fusoDoAparelho();
  return fuso ? { ...corpo, fuso } : corpo;
}

export const acompanhantesApi = {
  listar(profileId?: string): Promise<z.infer<typeof listaSchema>> {
    const query = profileId ? `?profileId=${encodeURIComponent(profileId)}` : '';
    return request(`/api/me/acompanhantes${query}`, { authenticated: true }, (data) =>
      listaSchema.parse(data),
    );
  },

  criar(
    input: NovoAcompanhante,
  ): Promise<{ caregiver: Acompanhante; convite: ResultadoDoConvite }> {
    return request(
      '/api/me/acompanhantes',
      { method: 'POST', body: comFuso(input), authenticated: true },
      (data) =>
        z
          .object({
            caregiver: acompanhanteSchema,
            convite: z.enum(['enviada', 'falha', 'nao-configurado']),
          })
          .parse(data),
    );
  },

  /** Nao reenvia o convite: so o cadastro manda mensagem. */
  atualizar(id: string, mudancas: MudancasNoAcompanhante): Promise<Acompanhante> {
    return request(
      `/api/me/acompanhantes?id=${encodeURIComponent(id)}`,
      { method: 'PATCH', body: comFuso(mudancas), authenticated: true },
      (data) => z.object({ caregiver: acompanhanteSchema }).parse(data).caregiver,
    );
  },

  remover(id: string): Promise<void> {
    return request(
      `/api/me/acompanhantes?id=${encodeURIComponent(id)}`,
      { method: 'DELETE', authenticated: true },
      () => undefined,
    );
  },
};
