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
  /**
   * Foto como data URI JPEG, ja reduzida para 200x200 pelo app.
   *
   * nullish() e nao nullable(): se este aplicativo rodar contra uma API que
   * ainda nao tem a coluna, o campo chega ausente. Com nullable() o parse
   * lancaria e a tela de Medicos inteira morreria — lista vazia e erro
   * generico. Com nullish() ela apenas degrada: todos sem foto.
   */
  photo: z.string().nullish(),
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
  /** Data URI JPEG. null remove a foto; ausente preserva a atual. */
  photo?: string | null;
};

export const appointmentSchema = z.object({
  id: z.uuid(),
  profileId: z.uuid(),
  professionalId: z.uuid().nullable(),
  title: z.string().nullable(),
  scheduledAt: z.string(),
  durationMinutes: z.number().nullable(),
  modality: modalitySchema,
  location: z.string().nullable(),
  address: z.string().nullable(),
  status: z.enum(['agendada', 'realizada', 'cancelada', 'faltou']),
  reminderMinutesBefore: z.number().nullable(),
  notes: z.string().nullable(),
  // Vem do join na listagem; ausentes na resposta de criacao.
  profileName: z.string().nullish(),
  professionalName: z.string().nullish(),
  professionalSpecialty: z.string().nullish(),
});
export type Appointment = z.infer<typeof appointmentSchema>;

export type AppointmentInput = {
  profileId: string;
  professionalId?: string | null;
  scheduledAt: string;
  modality: 'presencial' | 'teleconsulta';
  location?: string | null;
  address?: string | null;
  reminderMinutesBefore?: number | null;
  notes?: string | null;
};

export const referenceLocationSchema = z.object({
  label: z.string().nullable(),
  address: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
});
export type ReferenceLocation = z.infer<typeof referenceLocationSchema>;

export const healthApi = {
  getLocation(): Promise<ReferenceLocation | null> {
    return request('/api/me/location', { authenticated: true }, (data) =>
      z.object({ location: referenceLocationSchema.nullable() }).parse(data).location,
    );
  },

  setLocationByAddress(address: string): Promise<ReferenceLocation | null> {
    return request(
      '/api/me/location',
      { method: 'PUT', body: { address }, authenticated: true },
      (data) => z.object({ location: referenceLocationSchema.nullable() }).parse(data).location,
    );
  },

  setLocationByCoords(latitude: number, longitude: number): Promise<ReferenceLocation | null> {
    return request(
      '/api/me/location',
      { method: 'PUT', body: { latitude, longitude }, authenticated: true },
      (data) => z.object({ location: referenceLocationSchema.nullable() }).parse(data).location,
    );
  },

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

  /**
   * Um medico so.
   *
   * A tela de edicao baixava a lista inteira e filtrava em memoria. Era
   * desperdicio mesmo antes; com a foto embutida em cada item, seria baixar
   * as fotos de todos os medicos para editar um.
   */
  getProfessional(id: string): Promise<Professional> {
    return request(`/api/professionals/${id}`, { authenticated: true }, (data) =>
      z.object({ professional: professionalSchema }).parse(data).professional,
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

  deleteProfessional(id: string): Promise<void> {
    return request(
      `/api/professionals/${id}`,
      { method: 'DELETE', authenticated: true },
      () => undefined,
    );
  },

  listAppointments(filtros?: { profileId?: string | null; upcoming?: boolean }) {
    const params = new URLSearchParams();
    if (filtros?.profileId) params.set('profileId', filtros.profileId);
    if (filtros?.upcoming) params.set('upcoming', 'true');
    const query = params.toString();

    return request<Appointment[]>(
      `/api/appointments${query ? `?${query}` : ''}`,
      { authenticated: true },
      (data) => z.object({ appointments: z.array(appointmentSchema) }).parse(data).appointments,
    );
  },

  createAppointment(input: AppointmentInput): Promise<Appointment> {
    return request(
      '/api/appointments',
      { method: 'POST', body: input, authenticated: true },
      (data) => z.object({ appointment: appointmentSchema }).parse(data).appointment,
    );
  },
};
