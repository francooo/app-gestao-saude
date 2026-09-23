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
  // nullish() nos campos novos: contra uma API mais antiga eles chegam
  // ausentes, e com nullable() o parse lancaria e a tela inteira morreria.
  notes: z.string().nullish(),
  photo: z.string().nullish(),
  /** Quilos. O servidor ja converte de numeric para numero. */
  weightKg: z.number().nullish(),
  /** Centimetros inteiros. A tela converte para metros na borda. */
  heightCm: z.number().nullish(),
  /**
   * default(true) e nao nullish(): evita checar nulo em toda tela e ainda
   * tolera uma API que nao devolva o campo.
   */
  isActive: z.boolean().default(true),
});
export type Profile = z.infer<typeof profileSchema>;

/**
 * Parentescos aceitos pelo servidor.
 *
 * Espelha relationshipValues de apps/api/src/contracts.ts — aquele arquivo e
 * autocontido de proposito (apps/api nao depende do workspace), entao a copia
 * mora aqui, junto do resto do espelho. Mudar la, mudar aqui.
 *
 * 'titular' fica de fora nos dois lados: quem grava essa string e o cadastro
 * da conta, e aceita-la deixaria rotular um dependente como titular sem ele
 * ser o dono.
 */
export const relationshipValues = [
  'cônjuge',
  'filho',
  'filha',
  'mãe',
  'pai',
  'avó',
  'avô',
  'outro',
] as const;

export type ProfileInput = {
  fullName: string;
  birthDate?: string | null;
  relationship?: string | null;
  avatarColor?: string | null;
  notes?: string | null;
  photo?: string | null;
  weightKg?: number | null;
  heightCm?: number | null;
};

/** isActive so no PATCH: e ele que remove e restaura. */
export type ProfilePatch = Partial<ProfileInput> & { isActive?: boolean };

/** Quanto se perde ao apagar a pessoa de vez. So o GET por id devolve. */
export const profileCountsSchema = z.object({
  medications: z.number(),
  doses: z.number(),
  appointments: z.number(),
  upcomingAppointments: z.number(),
  assistantConversations: z.number(),
});
export type ProfileCounts = z.infer<typeof profileCountsSchema>;

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

// ---------------------------------------------------------------------------
// Medicamentos
//
// O servidor nao tem opiniao sobre fuso: ele guarda instante absoluto e
// devolve os horarios fixos como hora de parede ("08:00"). Todo o calculo de
// "hoje", "proxima dose" e "tomado as" e do aplicativo — ver lib/posologia.ts.
// ---------------------------------------------------------------------------

export const scheduleTypeSchema = z.enum(['interval', 'fixed_times', 'as_needed']);
export type ScheduleType = z.infer<typeof scheduleTypeSchema>;

export const doseSchema = z.object({
  id: z.uuid(),
  medicationId: z.uuid(),
  /** Nulo em 'se necessario'. E a chave da idempotencia no servidor. */
  scheduledFor: z.string().nullish(),
  takenAt: z.string().nullish(),
  status: z.enum(['tomada', 'pulada', 'atrasada']),
  amount: z.number().nullish(),
  notes: z.string().nullish(),
  recordedBy: z.uuid().nullish(),
});
export type Dose = z.infer<typeof doseSchema>;

export const medicationSchema = z.object({
  id: z.uuid(),
  profileId: z.uuid(),
  name: z.string(),
  strength: z.string().nullish(),
  form: z.string().nullish(),
  doseAmount: z.number().nullish(),
  doseUnit: z.string().nullish(),
  scheduleType: scheduleTypeSchema,
  intervalHours: z.number().nullish(),
  startsAt: z.string().nullish(),
  endsAt: z.string().nullish(),
  instructions: z.string().nullish(),
  prescriberId: z.uuid().nullish(),
  prescriberName: z.string().nullish(),
  isActive: z.boolean(),
  createdAt: z.string(),
  /** Do perfil dono, para o mini avatar no modo "todos da familia". */
  profileName: z.string().nullish(),
  profileColor: z.string().nullish(),
  /** default([]) e melhor que nullish: a tela nunca precisa checar nulo. */
  times: z.array(z.string()).default([]),
  doses: z.array(doseSchema).default([]),
  /**
   * max(takenAt), ignorando a janela. A ancora do proximo horario de um
   * remedio "a cada N horas" pode estar fora dela.
   */
  lastDoseAt: z.string().nullish(),
});
export type Medication = z.infer<typeof medicationSchema>;

export type MedicationInput = {
  profileId: string;
  name: string;
  strength?: string | null;
  form?: string | null;
  doseAmount?: number | null;
  doseUnit?: string | null;
  scheduleType: ScheduleType;
  intervalHours?: number | null;
  times?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  instructions?: string | null;
  prescriberId?: string | null;
};

/** profileId ausente: o servidor ignora, e mover de perfil orfanaria o historico. */
export type MedicationPatch = Partial<Omit<MedicationInput, 'profileId'>> & {
  isActive?: boolean;
};

export type DoseInput = {
  scheduledFor?: string | null;
  takenAt?: string | null;
  status?: 'tomada' | 'pulada';
  amount?: number | null;
  notes?: string | null;
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

  /** O argumento e opcional para os chamadores antigos seguirem compilando. */
  listProfiles(opts?: { includeInactive?: boolean }): Promise<Profile[]> {
    const query = opts?.includeInactive ? '?includeInactive=true' : '';
    return request(`/api/profiles${query}`, { authenticated: true }, (data) =>
      z.object({ profiles: z.array(profileSchema) }).parse(data).profiles,
    );
  },

  getProfile(id: string): Promise<{ profile: Profile; counts: ProfileCounts }> {
    return request(`/api/profiles/${id}`, { authenticated: true }, (data) =>
      z.object({ profile: profileSchema, counts: profileCountsSchema }).parse(data),
    );
  },

  createProfile(input: ProfileInput): Promise<Profile> {
    return request('/api/profiles', { method: 'POST', body: input, authenticated: true }, (data) =>
      z.object({ profile: profileSchema }).parse(data).profile,
    );
  },

  updateProfile(id: string, input: ProfilePatch): Promise<Profile> {
    return request(
      `/api/profiles/${id}`,
      { method: 'PATCH', body: input, authenticated: true },
      (data) => z.object({ profile: profileSchema }).parse(data).profile,
    );
  },

  /** Apaga de vez, com o historico de saude junto. Ver o aviso da tela. */
  deleteProfile(id: string): Promise<void> {
    return request(
      `/api/profiles/${id}`,
      { method: 'DELETE', authenticated: true },
      () => undefined,
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

  /**
   * Os remedios com horarios e doses da janela, numa resposta so.
   *
   * `from`/`to` saem do fuso do APARELHO: so ele sabe que dia e hoje. Ver o
   * comentario no topo do bloco de medicamentos.
   */
  listMedications(filtros: {
    from: Date;
    to: Date;
    profileId?: string | null;
    includeInactive?: boolean;
  }) {
    const params = new URLSearchParams({
      from: filtros.from.toISOString(),
      to: filtros.to.toISOString(),
    });
    if (filtros.profileId) params.set('profileId', filtros.profileId);
    if (filtros.includeInactive) params.set('includeInactive', 'true');

    return request<Medication[]>(
      `/api/medications?${params.toString()}`,
      { authenticated: true },
      (data) => z.object({ medications: z.array(medicationSchema) }).parse(data).medications,
    );
  },

  getMedication(id: string): Promise<Medication> {
    return request(`/api/medications/${id}`, { authenticated: true }, (data) =>
      z.object({ medication: medicationSchema }).parse(data).medication,
    );
  },

  createMedication(input: MedicationInput): Promise<Medication> {
    return request(
      '/api/medications',
      { method: 'POST', body: input, authenticated: true },
      (data) => z.object({ medication: medicationSchema }).parse(data).medication,
    );
  },

  updateMedication(id: string, input: MedicationPatch): Promise<Medication> {
    return request(
      `/api/medications/${id}`,
      { method: 'PATCH', body: input, authenticated: true },
      (data) => z.object({ medication: medicationSchema }).parse(data).medication,
    );
  },

  deleteMedication(id: string): Promise<void> {
    return request(
      `/api/medications/${id}`,
      { method: 'DELETE', authenticated: true },
      () => undefined,
    );
  },

  /**
   * Registra uma dose. POST no MEDICAMENTO, e nao numa rota /doses: o plano
   * Hobby da Vercel limita as funcoes e uma rota separada nao compraria nada.
   *
   * Com `scheduledFor`, e idempotente no servidor (indice unico por horario),
   * entao reenviar por falha de rede nao duplica.
   */
  registerDose(medicationId: string, input: DoseInput): Promise<Dose> {
    return request(
      `/api/medications/${medicationId}`,
      { method: 'POST', body: input, authenticated: true },
      (data) => z.object({ dose: doseSchema }).parse(data).dose,
    );
  },

  deleteDose(medicationId: string, doseId: string): Promise<void> {
    return request(
      `/api/medications/${medicationId}?doseId=${doseId}`,
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
