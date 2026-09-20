import { z } from 'zod';

import { request } from '@/api/client';

/**
 * Chamadas autenticadas do dominio de saude.
 *
 * Todas passam `authenticated: true`, o que faz o client anexar o access token
 * e, num 401, tentar renovar a sessao uma vez antes de desistir.
 */

const modalitySchema = z.enum(['presencial', 'teleconsulta']);

export const profileSchema = z.object({
  id: z.uuid(),
  fullName: z.string(),
  birthDate: z.string().nullable(),
  relationship: z.string().nullable(),
  avatarColor: z.string().nullable(),
  isAccountHolder: z.boolean(),
});
export type Profile = z.infer<typeof profileSchema>;

export const professionalSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  specialty: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  clinicName: z.string().nullable(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  defaultModality: modalitySchema.nullable(),
  myRating: z.number().nullable(),
  ratingNote: z.string().nullable(),
  notes: z.string().nullable(),
});
export type Professional = z.infer<typeof professionalSchema>;

export type ProfessionalInput = {
  name: string;
  specialty?: string | null;
  phone?: string | null;
  clinicName?: string | null;
  address?: string | null;
  defaultModality?: 'presencial' | 'teleconsulta' | null;
  myRating?: number | null;
  notes?: string | null;
};

export const healthApi = {
  listProfiles(): Promise<Profile[]> {
    return request('/api/profiles', { authenticated: true }, (data) =>
      z.object({ profiles: z.array(profileSchema) }).parse(data).profiles,
    );
  },

  listProfessionals(filtros?: { specialty?: string | null; profileId?: string | null }) {
    const params = new URLSearchParams();
    if (filtros?.specialty) params.set('specialty', filtros.specialty);
    if (filtros?.profileId) params.set('profileId', filtros.profileId);
    const query = params.toString();

    return request<Professional[]>(
      `/api/professionals${query ? `?${query}` : ''}`,
      { authenticated: true },
      (data) => z.object({ professionals: z.array(professionalSchema) }).parse(data).professionals,
    );
  },

  createProfessional(input: ProfessionalInput): Promise<Professional> {
    return request(
      '/api/professionals',
      { method: 'POST', body: input, authenticated: true },
      (data) => z.object({ professional: professionalSchema }).parse(data).professional,
    );
  },

  updateProfessional(id: string, input: Partial<ProfessionalInput>): Promise<Professional> {
    return request(
      `/api/professionals/${id}`,
      { method: 'PATCH', body: input, authenticated: true },
      (data) => z.object({ professional: professionalSchema }).parse(data).professional,
    );
  },
};
