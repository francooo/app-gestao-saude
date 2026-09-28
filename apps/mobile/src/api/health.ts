import { z } from 'zod';

import { request } from '@/api/client';
import { ANEXO_TIMEOUT_MS, ASSISTANT_TIMEOUT_MS, LEITURA_TIMEOUT_MS } from '@/config';
import { agoraLocalISO, fusoDoAparelho } from '@/lib/horaLocal';

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
  /**
   * Quando o peso foi anotado. SOMENTE LEITURA: quem carimba e o servidor, ao
   * salvar o peso. Nulo em quem ja tinha peso antes desta coluna existir.
   */
  weightMeasuredAt: z.string().nullish(),
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
  symptoms: z.number(),
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
  /**
   * Quantas unidades vem na embalagem. A unidade e o `form`.
   *
   * `nullish` pelo motivo de sempre neste arquivo: contra um servidor mais
   * antigo o campo chega AUSENTE, e `nullable()` sozinho derrubaria a tela.
   */
  packageAmount: z.number().nullish(),
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
  /**
   * Data URI JPEG da receita.
   *
   * `nullish` porque o campo tem TRES situacoes: vem com valor no detalhe,
   * vem `null` no detalhe sem receita, e NAO VEM na listagem — de proposito,
   * senao a tela inicial baixaria a receita de todos os remedios da familia a
   * cada abertura.
   */
  prescriptionPhoto: z.string().nullish(),
  /**
   * Data URI JPEG da foto da EMBALAGEM.
   *
   * Mesmas tres situacoes da receita — e uma quarta enquanto o `eas update`
   * nao alcanca todo mundo: contra um servidor que ainda nao conhece o campo,
   * ele simplesmente nao vem. `nullish` cobre as quatro.
   */
  packagePhoto: z.string().nullish(),
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
  packageAmount?: number | null;
  scheduleType: ScheduleType;
  intervalHours?: number | null;
  times?: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  instructions?: string | null;
  prescriberId?: string | null;
  /**
   * De qual leitura de foto este cadastro veio, e de qual item dela.
   *
   * Nao e seguranca (o servidor confere que a leitura e da conta): e o que
   * permite comparar depois o que a IA propos com o que a pessoa salvou. O
   * cadastro manual nao manda nenhum dos dois.
   */
  photoReadId?: string | null;
  photoReadItem?: number | null;
};

/**
 * Um remedio lido de uma foto.
 *
 * NAO E um Medication: nao tem id, nem perfil, nem createdAt — nada disso
 * existe antes de a pessoa salvar.
 *
 * `form` e `scheduleType` sao string frouxa DE PROPOSITO, ao contrario do
 * resto do arquivo. Se o servidor um dia devolver um valor que o enum daqui
 * nao conhece, um `z.enum` faria o parse LANCAR e jogaria fora um envio de ate
 * 45 s por causa de uma palavra. O servidor ja normaliza; aqui a tela so
 * aproveita o que reconhece.
 */
export const medicamentoLidoSchema = z.object({
  index: z.number(),
  name: z.string(),
  strength: z.string().nullish(),
  form: z.string().nullish(),
  doseAmount: z.number().nullish(),
  doseUnit: z.string().nullish(),
  packageAmount: z.number().nullish(),
  scheduleType: z.string().nullish(),
  intervalHours: z.number().nullish(),
  times: z.array(z.string()).default([]),
  /** "por 7 dias". Vira endsAt AQUI, com o relogio do aparelho. */
  durationDays: z.number().nullish(),
  instructions: z.string().nullish(),
});
export type MedicamentoLido = z.infer<typeof medicamentoLidoSchema>;

export const leituraDeFotoSchema = z.object({
  readId: z.uuid(),
  kind: z.enum(['receita', 'caixa']),
  /** Vazia e resposta VALIDA: "nao li remedio nenhum nesta foto". */
  items: z.array(medicamentoLidoSchema).default([]),
  /** Itens que o modelo devolveu e nao davam para aproveitar. */
  discarded: z.number().default(0),
  prescriber: z
    .object({ nameRead: z.string().nullish(), professionalId: z.uuid().nullish() })
    .nullish(),
});
export type LeituraDeFoto = z.infer<typeof leituraDeFotoSchema>;

// ---------------------------------------------------------------------------
// Diario de sintomas
// ---------------------------------------------------------------------------

export const symptomKindSchema = z.enum(['febre', 'dor', 'nausea', 'tosse', 'humor', 'sono']);
export type SymptomKind = z.infer<typeof symptomKindSchema>;

export const symptomEntrySchema = z.object({
  id: z.uuid(),
  profileId: z.uuid(),
  kind: symptomKindSchema,
  /** 1 a 5. O rotulo de cada degrau muda por tipo — ver lib/diarioDeSintomas. */
  intensity: z.number(),
  /** So em febre. Numero, nao texto: o servidor serializa o `numeric`. */
  temperatureC: z.number().nullish(),
  occurredAt: z.string(),
  note: z.string().nullish(),
  createdAt: z.string(),
  /** Vem do join na listagem; ausente na resposta de criacao. */
  profileName: z.string().nullish(),
  profileColor: z.string().nullish(),
});
export type SymptomEntry = z.infer<typeof symptomEntrySchema>;

export type SymptomInput = {
  profileId: string;
  kind: SymptomKind;
  intensity: number;
  occurredAt: string;
  temperatureC?: number | null;
  note?: string | null;
};

/** profileId ausente: o servidor ignora, e mover de perfil orfanaria o historico. */
export type MedicationPatch = Partial<Omit<MedicationInput, 'profileId'>> & {
  isActive?: boolean;
  /** null remove a receita; ausente preserva a que estiver la. */
  prescriptionPhoto?: string | null;
  /** Mesma semantica. Uma nao encosta na outra — o servidor filtra por tipo. */
  packagePhoto?: string | null;
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

// ---------------------------------------------------------------------------
// Assistente
//
// O escopo e estreito de proposito: o assistente responde sobre os dados que a
// familia cadastrou. O contexto vai PRONTO daqui (ver lib/contextoDeSaude.ts)
// porque so este aparelho sabe que horas sao.
// ---------------------------------------------------------------------------

export const assistantMessageSchema = z.object({
  id: z.uuid(),
  conversationId: z.uuid(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
  model: z.string().nullish(),
  createdAt: z.string(),
});
export type AssistantMessage = z.infer<typeof assistantMessageSchema>;

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

  /**
   * Manda a foto e devolve os remedios que o modelo conseguiu ler.
   *
   * Devolve uma LISTA: uma receita costuma trazer de 2 a 5, e escolher qual
   * cadastrar e da pessoa. Lista vazia e resposta VALIDA — "nao li nada aqui"
   * —, e a tela trata isso como desfecho proprio, nao como erro.
   *
   * A foto vem de escolherFotoDeDocumento, e so de la: a URI crua do seletor
   * levaria o EXIF junto, com a coordenada do consultorio.
   */
  lerFoto(
    input: { photo: string; kind: 'receita' | 'caixa'; profileId?: string | null },
    signal?: AbortSignal,
  ): Promise<LeituraDeFoto> {
    return request(
      '/api/assistant/ler-foto',
      { method: 'POST', body: input, authenticated: true, timeoutMs: LEITURA_TIMEOUT_MS, signal },
      (data) => leituraDeFotoSchema.parse(data),
    );
  },

  /**
   * O diario de sintomas de um periodo.
   *
   * A janela e obrigatoria e tem teto de 31 dias no servidor, pelo mesmo
   * motivo da listagem de doses: quem sabe que dia e hoje e o aparelho.
   */
  listSymptoms(input: {
    profileId?: string | null;
    from: Date;
    to: Date;
  }): Promise<SymptomEntry[]> {
    const q = new URLSearchParams({
      from: agoraLocalISO(input.from),
      to: agoraLocalISO(input.to),
    });
    if (input.profileId) q.set('profileId', input.profileId);

    return request(
      `/api/diary/sintomas?${q.toString()}`,
      { authenticated: true },
      (data) => z.object({ symptoms: z.array(symptomEntrySchema) }).parse(data).symptoms,
    );
  },

  createSymptom(input: SymptomInput): Promise<SymptomEntry> {
    return request(
      '/api/diary/sintomas',
      { method: 'POST', body: input, authenticated: true },
      (data) => z.object({ symptom: symptomEntrySchema }).parse(data).symptom,
    );
  },

  /** O id vai na querystring: o roteador ocupa o segmento do caminho. */
  deleteSymptom(id: string): Promise<void> {
    return request(
      `/api/diary/sintomas?id=${id}`,
      { method: 'DELETE', authenticated: true },
      () => undefined,
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
      {
        method: 'PATCH',
        body: input,
        authenticated: true,
        // O prazo maior SO quando ha foto no corpo. Dar 45 s a todo PATCH
        // faria um "encerrar tratamento" sem rede ficar quase um minuto
        // parecendo que vai dar certo.
        ...(input.prescriptionPhoto || input.packagePhoto ? { timeoutMs: ANEXO_TIMEOUT_MS } : {}),
      },
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

  /**
   * Manda a pergunta e devolve as DUAS mensagens gravadas.
   *
   * Sem streaming, mesmo agora que a resposta pode levar 15 s: streaming aqui
   * exigiria SSE e expo/fetch, e a tela ja mostra em que passo o assistente
   * esta. Vale revisitar, e esta anotado como pendencia.
   *
   * O PRAZO E OUTRO, e maior que o de todas as outras chamadas. A cadeia e
   * proposital: laco no servidor 45 s < maxDuration da Vercel 60 s < este.
   * Se o cliente desistisse primeiro, o servidor terminaria, gravaria a
   * resposta, e a pessoa veria erro por algo que ja esta no historico — e
   * reenviaria, pagando a busca duas vezes.
   */
  perguntarAoAssistente(input: {
    question: string;
    profileId?: string | null;
    context?: string | null;
  }): Promise<AssistantMessage[]> {
    return request(
      '/api/assistant/mensagem',
      {
        method: 'POST',
        // O horario sai DAQUI porque so este aparelho sabe que horas sao onde
        // a pessoa esta. Sem ele o servidor responde em UTC e erra o "hoje".
        body: { ...input, agora: agoraLocalISO(), fusoHorario: fusoDoAparelho() },
        authenticated: true,
        timeoutMs: ASSISTANT_TIMEOUT_MS,
      },
      (data) => z.object({ messages: z.array(assistantMessageSchema) }).parse(data).messages,
    );
  },

  historicoDoAssistente(profileId?: string | null): Promise<AssistantMessage[]> {
    const query = profileId ? `?profileId=${profileId}` : '';
    return request(`/api/assistant/historico${query}`, { authenticated: true }, (data) =>
      z.object({ messages: z.array(assistantMessageSchema) }).parse(data).messages,
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
