import { config as loadEnv } from 'dotenv';

// Carrega o ambiente ANTES de qualquer coisa que leia process.env.
loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

/**
 * Cria uma conta de teste com uma familia completa.
 *
 * Nao ha auto-cadastro pela linha de comando — este script existe para
 * exercitar o modelo de dados e destravar o trabalho de API sem depender de
 * cadastro manual pelo app. Rode de dentro de apps/api:
 *   pnpm db:seed
 *
 * E idempotente: rodar de novo apaga a familia anterior desta conta e recria.
 */
async function main() {
  const { eq } = await import('drizzle-orm');
  const { db } = await import('../src/db/client');
  const {
    users,
    profiles,
    professionals,
    appointments,
    medications,
    medicationTimes,
    medicationDoses,
    consents,
  } = await import('../src/db/schema');
  const { hashPassword } = await import('../src/lib/password');
  const { POLICY_VERSION } = await import('../src/contracts');

  const email = (process.env.SEED_EMAIL ?? 'teste@gestaosaude.com.br').toLowerCase();
  const password = process.env.SEED_PASSWORD ?? 'senha-de-teste-123';
  const titular = process.env.SEED_NAME ?? 'Ana Clara Souza';

  if (password.length < 8) throw new Error('SEED_PASSWORD precisa ter ao menos 8 caracteres');

  const passwordHash = await hashPassword(password);

  const [existente] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));

  let userId: string;
  if (existente) {
    // Apagar os perfis leva medicamentos, doses e consultas junto pela
    // cascata — e tambem o teste de que a cascata funciona.
    await db.delete(profiles).where(eq(profiles.userId, existente.id));
    await db.delete(professionals).where(eq(professionals.userId, existente.id));
    await db
      .update(users)
      .set({ passwordHash, fullName: titular, isActive: true, updatedAt: new Date() })
      .where(eq(users.id, existente.id));
    userId = existente.id;
    console.log(`Conta reaproveitada: ${email}`);
  } else {
    const [criado] = await db
      .insert(users)
      .values({ email, passwordHash, fullName: titular })
      .returning({ id: users.id });
    userId = criado!.id;
    console.log(`Conta criada: ${email}`);
  }

  /**
   * Consentimento da politica.
   *
   * O seed nao gravava nenhum, e por isso a conta de teste caia sempre no
   * caminho "consentimento nao encontrado" — que e um estado legitimo (contas
   * anteriores a tabela), mas deixava o caminho FELIZ da tela de privacidade
   * sem como ser exercitado.
   *
   * Insere sem apagar os anteriores: a tabela e append-only, e o historico de
   * aceites e o registro de conformidade.
   */
  await db.insert(consents).values({ userId, policyVersion: POLICY_VERSION });

  // --- Perfis da familia ---------------------------------------------------
  const familia = await db
    .insert(profiles)
    .values([
      {
        userId,
        fullName: titular,
        relationship: 'titular',
        isAccountHolder: true,
        birthDate: '1992-04-18',
      },
      { userId, fullName: 'Lucas Souza', relationship: 'filho', birthDate: '2021-09-03' },
      { userId, fullName: 'Roberta Bueno', relationship: 'mãe', birthDate: '1963-01-27' },
      { userId, fullName: 'Sofia Castro', relationship: 'filha', birthDate: '2018-11-12' },
    ])
    .returning({ id: profiles.id, fullName: profiles.fullName });

  const porNome = (nome: string) => familia.find((p) => p.fullName === nome)!.id;

  // --- Profissional --------------------------------------------------------
  const [pediatra] = await db
    .insert(professionals)
    .values({
      userId,
      name: 'Dra. Ana Costa',
      specialty: 'Pediatria',
      clinicName: 'Clínica Vida',
      phone: '(11) 3000-0000',
    })
    .returning({ id: professionals.id });

  // --- Medicamentos: um de cada tipo de horario ----------------------------
  const [amoxicilina] = await db
    .insert(medications)
    .values({
      profileId: porNome('Lucas Souza'),
      name: 'Amoxicilina',
      strength: '500mg',
      form: 'cápsula',
      doseAmount: '1',
      doseUnit: 'cápsula',
      scheduleType: 'interval',
      intervalHours: 8,
      startsAt: new Date(Date.now() - 26 * 60 * 60 * 1000),
      endsAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      instructions: 'Tomar com um copo de água, após as refeições.',
      prescriberId: pediatra!.id,
    })
    .returning({ id: medications.id });

  const [vitaminaD] = await db
    .insert(medications)
    .values({
      profileId: porNome('Roberta Bueno'),
      name: 'Vitamina D',
      strength: '2000 UI',
      form: 'gotas',
      doseAmount: '5',
      doseUnit: 'gotas',
      scheduleType: 'fixed_times',
    })
    .returning({ id: medications.id });

  await db.insert(medicationTimes).values([
    { medicationId: vitaminaD!.id, timeOfDay: '08:00:00' },
    { medicationId: vitaminaD!.id, timeOfDay: '20:00:00' },
  ]);

  await db.insert(medications).values({
    profileId: porNome('Sofia Castro'),
    name: 'Dipirona',
    strength: '500mg/mL',
    form: 'gotas',
    scheduleType: 'as_needed',
    instructions: 'Somente em caso de febre, conforme orientação da pediatra.',
  });

  // --- Doses ja registradas (alimentam o "ultima dose ha 2h") --------------
  await db.insert(medicationDoses).values([
    {
      medicationId: amoxicilina!.id,
      profileId: porNome('Lucas Souza'),
      scheduledFor: new Date(Date.now() - 10 * 60 * 60 * 1000),
      takenAt: new Date(Date.now() - 10 * 60 * 60 * 1000),
      status: 'tomada',
      recordedBy: userId,
    },
    {
      medicationId: amoxicilina!.id,
      profileId: porNome('Lucas Souza'),
      scheduledFor: new Date(Date.now() - 2 * 60 * 60 * 1000),
      takenAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      status: 'tomada',
      recordedBy: userId,
    },
  ]);

  // --- Consulta ------------------------------------------------------------
  const emTresDias = new Date();
  emTresDias.setDate(emTresDias.getDate() + 3);
  emTresDias.setHours(9, 0, 0, 0);

  await db.insert(appointments).values({
    profileId: porNome('Lucas Souza'),
    professionalId: pediatra!.id,
    title: 'Retorno',
    scheduledAt: emTresDias,
    durationMinutes: 30,
    modality: 'presencial',
    location: 'Clínica Vida',
    address: 'Rua das Acácias, 120 — São Paulo',
  });

  console.log(`Família criada: ${familia.map((p) => p.fullName).join(', ')}`);
  console.log('3 medicamentos (intervalo, horários fixos, se necessário), 2 doses, 1 consulta');
  console.log(`Senha: ${password}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
