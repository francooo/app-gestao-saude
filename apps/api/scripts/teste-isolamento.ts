/**
 * Teste de regressao de ISOLAMENTO ENTRE CONTAS, contra a API HTTP.
 *
 * Por que existe: toda rota de saude escopa por conta (direto pelo userId ou
 * por join com profiles). Um esquecimento desse filtro numa rota nova nao
 * quebra typecheck nem tela nenhuma — so aparece quando alguem le o dado de
 * outra familia. Este script cria duas contas descartaveis, A e B, e prova que
 * B nao le, nao altera, nao apaga e nao escreve nada de A.
 *
 * Roda contra HTTP (e nao importando handlers) de proposito: o que se quer
 * provar e o comportamento do deploy, incluindo roteadores e rewrites.
 *
 * Uso: BASE_URL=https://... npx tsx scripts/teste-isolamento.ts
 * Sem BASE_URL, vai contra a producao.
 *
 * NAO chama /api/assistant/mensagem, ler-foto nem posologia: custam IA.
 */

import { randomBytes } from 'node:crypto';

import { POLICY_VERSION } from '../src/contracts';

const BASE_URL = (process.env.BASE_URL ?? 'https://app-gestao-saude.vercel.app').replace(/\/$/, '');

type Resposta = { status: number; body: any };

type Conta = {
  rotulo: string;
  email: string;
  senha: string;
  token: string | null;
};

type Resultado = { nome: string; ok: boolean; detalhe: string };
const resultados: Resultado[] = [];

function registrar(nome: string, ok: boolean, detalhe: string) {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? 'PASSOU' : 'FALHOU'}  ${nome}  (${detalhe})`);
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function chamar(
  metodo: string,
  caminho: string,
  token: string | null,
  corpo?: unknown,
): Promise<Resposta> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (corpo !== undefined) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${BASE_URL}${caminho}`, {
    method: metodo,
    headers,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  const texto = await r.text();
  let body: any = texto;
  try {
    body = texto ? JSON.parse(texto) : null;
  } catch {
    // Corpo nao-JSON (ex.: pagina de erro da Vercel) fica como texto.
  }
  return { status: r.status, body };
}

/** Falha cedo e alto no SETUP: sem os dados de A, o resto do teste nao prova nada. */
function exigir(r: Resposta, esperado: number[], oQue: string): any {
  if (!esperado.includes(r.status)) {
    throw new Error(`Setup falhou em ${oQue}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
  }
  return r.body;
}

/**
 * Verificacao de ataque: B tentou mexer em algo de A.
 *
 * Aceita 404 (o padrao do projeto: nunca confirmar que o id existe) e 400
 * (validacao recusou antes). Qualquer 2xx e vazamento; 401/403/405/5xx tambem
 * falham porque nao sao o comportamento combinado — um 500 pode esconder uma
 * escrita parcial.
 */
async function negado(nome: string, metodo: string, caminho: string, token: string, corpo?: unknown) {
  const r = await chamar(metodo, caminho, token, corpo);
  const ok = r.status === 404 || r.status === 400;
  registrar(nome, ok, `${metodo} ${caminho} -> ${r.status}${ok ? '' : ' ' + JSON.stringify(r.body).slice(0, 200)}`);
}

/** Verificacao de lista: 200 e nenhum id de A dentro do corpo. */
async function listaSemVazamento(nome: string, caminho: string, token: string, idsDeA: string[], campo: string) {
  const r = await chamar('GET', caminho, token);
  const texto = JSON.stringify(r.body ?? '');
  const vazados = idsDeA.filter((id) => texto.includes(id));
  const lista = r.body?.[campo];
  const ok = r.status === 200 && Array.isArray(lista) && vazados.length === 0;
  registrar(
    nome,
    ok,
    `GET ${caminho} -> ${r.status}, ${Array.isArray(lista) ? lista.length : '?'} itens` +
      (vazados.length ? `, VAZOU ids: ${vazados.join(',')}` : ''),
  );
}

/** Verificacao de lista filtrada por perfil alheio: tem que vir VAZIA. */
async function listaVazia(nome: string, caminho: string, token: string, campo: string) {
  const r = await chamar('GET', caminho, token);
  const lista = r.body?.[campo];
  const ok = r.status === 200 && Array.isArray(lista) && lista.length === 0;
  registrar(nome, ok, `GET ${caminho} -> ${r.status}, ${Array.isArray(lista) ? lista.length : '?'} itens`);
}

function senhaForte() {
  // Base64url de 18 bytes + sufixo misto: passa em qualquer regra de forca e
  // fica abaixo dos 72 caracteres do bcrypt/scrypt.
  return `${randomBytes(18).toString('base64url')}Aa1!`;
}

async function criarConta(rotulo: string, carimbo: number): Promise<Conta> {
  const conta: Conta = {
    rotulo,
    email: `isolamento+${carimbo}-${rotulo.toLowerCase()}@example.com`,
    senha: senhaForte(),
    token: null,
  };
  const r = await chamar('POST', '/api/auth/register', null, {
    fullName: `Teste Isolamento ${rotulo}`,
    email: conta.email,
    password: conta.senha,
    passwordConfirmation: conta.senha,
    acceptedPolicy: true,
    // Informativo: o servidor grava a POLICY_VERSION dele, mas mandar a
    // versao deixa o rastro claro em log de requisicao.
    policyVersion: POLICY_VERSION,
  });
  if (r.status === 429) {
    throw new Error('Cadastro limitado por IP (5 por hora). Espere e rode de novo.');
  }
  const body = exigir(r, [201], `cadastro da conta ${rotulo}`);
  conta.token = body.accessToken;
  return conta;
}

/** Apaga a conta; devolve true se a conta deixou de existir. */
async function apagarConta(conta: Conta): Promise<boolean> {
  if (!conta.token) return false;
  const r = await chamar('POST', '/api/me/apagar-conta', conta.token, {
    currentPassword: conta.senha,
    confirmacao: true,
  });
  if (r.status !== 204) {
    console.error(`Falha ao apagar conta ${conta.rotulo}: HTTP ${r.status} ${JSON.stringify(r.body)}`);
    return false;
  }
  // Prova da exclusao: o login com as mesmas credenciais precisa falhar.
  const login = await chamar('POST', '/api/auth/login', null, { email: conta.email, password: conta.senha });
  return login.status === 401;
}

async function main() {
  console.log(`Teste de isolamento contra ${BASE_URL}\n`);
  const carimbo = Date.now();
  const contas: Conta[] = [];
  let erroDeExecucao: unknown = null;
  const limpeza: { rotulo: string; email: string; apagada: boolean }[] = [];

  try {
    const A = await criarConta('A', carimbo);
    contas.push(A);
    // Espaco entre cadastros: o limite e por IP e por janela, nao por segundo,
    // mas nao custa nada nao parecer rajada.
    await esperar(1500);
    const B = await criarConta('B', carimbo);
    contas.push(B);
    const tA = A.token!;
    const tB = B.token!;

    // ------------------------------------------------------------------
    // Setup: A cria um dado de cada dominio.
    // ------------------------------------------------------------------
    const agora = new Date();
    const de = new Date(agora.getTime() - 7 * 24 * 3600 * 1000).toISOString();
    const ate = new Date(agora.getTime() + 7 * 24 * 3600 * 1000).toISOString();
    const janela = `from=${encodeURIComponent(de)}&to=${encodeURIComponent(ate)}`;

    const perfilA = exigir(
      await chamar('POST', '/api/profiles', tA, { fullName: 'Membro de A', relationship: 'filho' }),
      [201],
      'perfil de A',
    ).profile.id as string;

    const medicoA = exigir(
      await chamar('POST', '/api/professionals', tA, { name: 'Dra. Medica de A', specialty: 'Clinica' }),
      [201],
      'medico de A',
    ).professional.id as string;

    // 'as_needed' dispensa horarios e deixa a dose sem scheduledFor.
    const remedioA = exigir(
      await chamar('POST', '/api/medications', tA, {
        profileId: perfilA,
        name: 'Remedio de A',
        scheduleType: 'as_needed',
        prescriberId: medicoA,
      }),
      [201],
      'remedio de A',
    ).medication.id as string;

    // Dose 'pulada' e nao 'tomada': a tomada dispara o aviso "Fulana tomou"
    // para acompanhantes, e o teste nao deve tocar em envio de WhatsApp.
    const doseA = exigir(
      await chamar('POST', `/api/medications/${remedioA}`, tA, { status: 'pulada' }),
      [200, 201],
      'dose de A',
    ).dose.id as string;

    const compraA = exigir(
      await chamar('POST', `/api/medications/${remedioA}?recurso=estoque`, tA, { units: 30 }),
      [201],
      'compra de estoque de A',
    ).medication.stockEntries[0].id as string;

    const consultaA = exigir(
      await chamar('POST', '/api/appointments', tA, {
        profileId: perfilA,
        professionalId: medicoA,
        title: 'Consulta de A',
        scheduledAt: new Date(agora.getTime() + 2 * 24 * 3600 * 1000).toISOString(),
      }),
      [201],
      'consulta de A',
    ).appointment.id as string;

    const sintomaA = exigir(
      await chamar('POST', '/api/diary/sintomas', tA, {
        profileId: perfilA,
        kind: 'dor',
        intensity: 2,
        occurredAt: new Date(agora.getTime() - 3600 * 1000).toISOString(),
      }),
      [201],
      'sintoma de A',
    ).symptom.id as string;

    // Acompanhante so se o WhatsApp NAO estiver configurado: o POST manda um
    // convite real ao numero, e nenhum numero ficticio e garantidamente de
    // ninguem.
    let acompanhanteA: string | null = null;
    const listaAcomp = exigir(await chamar('GET', '/api/me/acompanhantes', tA), [200], 'lista de acompanhantes de A');
    if (listaAcomp.whatsappConfigurado === true) {
      console.log('WhatsApp configurado no servidor: criacao de acompanhante PULADA (evita mensagem real).');
    } else {
      acompanhanteA = exigir(
        await chamar('POST', '/api/me/acompanhantes', tA, {
          profileId: perfilA,
          fullName: 'Acompanhante de A',
          phone: '(11) 99999-0000',
          notifyDose: false,
          notifyLate: false,
          notifyLowStock: false,
          notifyTaken: false,
        }),
        [201],
        'acompanhante de A',
      ).caregiver.id as string;
    }

    const perfisB = exigir(await chamar('GET', '/api/profiles', tB), [200], 'perfis de B').profiles;
    const perfilB = perfisB[0].id as string;
    const medicoB = exigir(
      await chamar('POST', '/api/professionals', tB, { name: 'Dr. Medico de B' }),
      [201],
      'medico de B',
    ).professional.id as string;
    const remedioB = exigir(
      await chamar('POST', '/api/medications', tB, { profileId: perfilB, name: 'Remedio de B', scheduleType: 'as_needed' }),
      [201],
      'remedio de B',
    ).medication.id as string;

    const idsDeA = [perfilA, medicoA, remedioA, doseA, compraA, consultaA, sintomaA, ...(acompanhanteA ? [acompanhanteA] : [])];
    console.log(`\nSetup ok. Ids de A: ${idsDeA.join(', ')}\n`);

    // ------------------------------------------------------------------
    // Controle positivo inicial: A enxerga o que criou. Sem isto, um 404 para
    // B poderia significar so que o dado nem existe.
    // ------------------------------------------------------------------
    async function controlePositivo(fase: string) {
      const checagens: [string, string, (b: any) => boolean][] = [
        ['perfil', `/api/profiles/${perfilA}`, (b) => b?.profile?.fullName === 'Membro de A'],
        ['medico', `/api/professionals/${medicoA}`, (b) => b?.professional?.name === 'Dra. Medica de A'],
        [
          'remedio+dose+compra',
          `/api/medications/${remedioA}`,
          (b) =>
            b?.medication?.name === 'Remedio de A' &&
            b.medication.doses?.some((d: any) => d.id === doseA) &&
            b.medication.stockEntries?.some((c: any) => c.id === compraA),
        ],
        ['historico', `/api/medications/${remedioA}?recurso=historico`, (b) => JSON.stringify(b).includes(doseA)],
        ['consulta', `/api/appointments/${consultaA}`, (b) => b?.appointment?.title === 'Consulta de A'],
        ['sintomas', `/api/diary/sintomas?profileId=${perfilA}&${janela}`, (b) => b?.symptoms?.some((s: any) => s.id === sintomaA)],
      ];
      if (acompanhanteA) {
        checagens.push([
          'acompanhante',
          `/api/me/acompanhantes?profileId=${perfilA}`,
          (b) => b?.caregivers?.some((c: any) => c.id === acompanhanteA && c.fullName === 'Acompanhante de A'),
        ]);
      }
      for (const [nome, caminho, conferir] of checagens) {
        const r = await chamar('GET', caminho, tA);
        registrar(`[controle ${fase}] A ve ${nome}`, r.status === 200 && conferir(r.body), `GET ${caminho} -> ${r.status}`);
      }
    }
    await controlePositivo('inicio');

    // ------------------------------------------------------------------
    // B tenta LER e ALTERAR cada id de A.
    // ------------------------------------------------------------------
    await negado('B GET perfil de A', 'GET', `/api/profiles/${perfilA}`, tB);
    await negado('B PATCH perfil de A', 'PATCH', `/api/profiles/${perfilA}`, tB, { fullName: 'Hackeado' });
    await negado('B GET medico de A', 'GET', `/api/professionals/${medicoA}`, tB);
    await negado('B PATCH medico de A', 'PATCH', `/api/professionals/${medicoA}`, tB, { name: 'Hackeado' });
    await negado('B GET remedio de A', 'GET', `/api/medications/${remedioA}`, tB);
    await negado('B GET historico do remedio de A', 'GET', `/api/medications/${remedioA}?recurso=historico`, tB);
    await negado('B PATCH remedio de A', 'PATCH', `/api/medications/${remedioA}`, tB, { name: 'Hackeado' });
    await negado('B POST dose no remedio de A', 'POST', `/api/medications/${remedioA}`, tB, { status: 'pulada' });
    await negado('B POST compra no remedio de A', 'POST', `/api/medications/${remedioA}?recurso=estoque`, tB, { units: 1 });
    await negado('B GET consulta de A', 'GET', `/api/appointments/${consultaA}`, tB);
    await negado('B PATCH consulta de A', 'PATCH', `/api/appointments/${consultaA}`, tB, { title: 'Hackeado' });
    if (acompanhanteA) {
      await negado('B PATCH acompanhante de A', 'PATCH', `/api/me/acompanhantes?id=${acompanhanteA}`, tB, {
        fullName: 'Hackeado',
      });
    }

    // Ids de A usados como referencia dentro de recursos de B.
    await negado('B DELETE dose de A via remedio de B', 'DELETE', `/api/medications/${remedioB}?doseId=${doseA}`, tB);
    await negado(
      'B DELETE compra de A via remedio de B',
      'DELETE',
      `/api/medications/${remedioB}?recurso=estoque&entrada=${compraA}`,
      tB,
    );
    await negado('B PATCH remedio de B com prescriberId de A', 'PATCH', `/api/medications/${remedioB}`, tB, {
      prescriberId: medicoA,
    });

    // ------------------------------------------------------------------
    // B tenta ESCREVER no perfil de A, ou referenciar o medico de A.
    // ------------------------------------------------------------------
    await negado('B POST remedio no perfil de A', 'POST', '/api/medications', tB, {
      profileId: perfilA,
      name: 'Intruso',
      scheduleType: 'as_needed',
    });
    await negado('B POST remedio com prescriberId de A', 'POST', '/api/medications', tB, {
      profileId: perfilB,
      name: 'Intruso',
      scheduleType: 'as_needed',
      prescriberId: medicoA,
    });
    await negado('B POST consulta no perfil de A', 'POST', '/api/appointments', tB, {
      profileId: perfilA,
      scheduledAt: new Date(agora.getTime() + 86400000).toISOString(),
    });
    await negado('B POST consulta com medico de A', 'POST', '/api/appointments', tB, {
      profileId: perfilB,
      professionalId: medicoA,
      scheduledAt: new Date(agora.getTime() + 86400000).toISOString(),
    });
    await negado('B POST sintoma no perfil de A', 'POST', '/api/diary/sintomas', tB, {
      profileId: perfilA,
      kind: 'dor',
      intensity: 1,
      occurredAt: agora.toISOString(),
    });
    // So roda se o WhatsApp estiver desligado: se a checagem de dono falhasse
    // com o provedor ligado, o convite sairia de verdade.
    if (!listaAcomp.whatsappConfigurado) {
      await negado('B POST acompanhante no perfil de A', 'POST', '/api/me/acompanhantes', tB, {
        profileId: perfilA,
        fullName: 'Intruso',
        phone: '(11) 99999-0001',
      });
    }

    // ------------------------------------------------------------------
    // Listas de B: filtradas pelo perfil de A vem vazias; sem filtro, nada
    // de A aparece.
    // ------------------------------------------------------------------
    await listaVazia('B lista remedios ?profileId de A', `/api/medications?profileId=${perfilA}&${janela}&includeInactive=true`, tB, 'medications');
    await listaVazia('B lista consultas ?profileId de A', `/api/appointments?profileId=${perfilA}`, tB, 'appointments');
    await listaVazia('B lista sintomas ?profileId de A', `/api/diary/sintomas?profileId=${perfilA}&${janela}`, tB, 'symptoms');
    await listaVazia('B lista medicos ?profileId de A', `/api/professionals?profileId=${perfilA}`, tB, 'professionals');
    await listaVazia('B lista acompanhantes ?profileId de A', `/api/me/acompanhantes?profileId=${perfilA}`, tB, 'caregivers');
    await listaVazia('B historico do assistente ?profileId de A', `/api/assistant/historico?profileId=${perfilA}`, tB, 'messages');

    await listaSemVazamento('B lista perfis (sem filtro)', '/api/profiles?includeInactive=true', tB, idsDeA, 'profiles');
    await listaSemVazamento('B lista remedios (sem filtro)', `/api/medications?${janela}&includeInactive=true`, tB, idsDeA, 'medications');
    await listaSemVazamento('B lista consultas (sem filtro)', '/api/appointments', tB, idsDeA, 'appointments');
    await listaSemVazamento('B lista sintomas (sem filtro)', `/api/diary/sintomas?${janela}`, tB, idsDeA, 'symptoms');
    await listaSemVazamento('B lista medicos (sem filtro)', '/api/professionals', tB, idsDeA, 'professionals');
    await listaSemVazamento('B lista acompanhantes (sem filtro)', '/api/me/acompanhantes', tB, idsDeA, 'caregivers');

    // Controle intermediario: nenhum PATCH de B pode ter mudado nada de A.
    await controlePositivo('apos PATCH/POST de B');

    // ------------------------------------------------------------------
    // B tenta APAGAR. Fica por ultimo porque, se vazar, destroi o dado que
    // as verificacoes anteriores precisavam.
    // ------------------------------------------------------------------
    await negado('B DELETE compra de A', 'DELETE', `/api/medications/${remedioA}?recurso=estoque&entrada=${compraA}`, tB);
    await negado('B DELETE dose de A', 'DELETE', `/api/medications/${remedioA}?doseId=${doseA}`, tB);
    await negado('B DELETE sintoma de A', 'DELETE', `/api/diary/sintomas?id=${sintomaA}`, tB);
    await negado('B DELETE consulta de A', 'DELETE', `/api/appointments/${consultaA}`, tB);
    if (acompanhanteA) {
      await negado('B DELETE acompanhante de A', 'DELETE', `/api/me/acompanhantes?id=${acompanhanteA}`, tB);
    }
    await negado('B DELETE remedio de A', 'DELETE', `/api/medications/${remedioA}`, tB);
    await negado('B DELETE medico de A', 'DELETE', `/api/professionals/${medicoA}`, tB);
    await negado('B DELETE perfil de A', 'DELETE', `/api/profiles/${perfilA}`, tB);

    await controlePositivo('final');
  } catch (e) {
    erroDeExecucao = e;
    console.error('\nERRO durante o teste:', e instanceof Error ? e.message : e);
  } finally {
    // Limpeza SEMPRE: conta de teste esquecida em producao e dado pessoal
    // (mesmo ficticio) sem finalidade, e polui metricas de cadastro.
    for (const conta of contas) {
      let apagada = false;
      try {
        apagada = await apagarConta(conta);
      } catch (e) {
        console.error(`Erro ao apagar ${conta.rotulo}:`, e instanceof Error ? e.message : e);
      }
      limpeza.push({ rotulo: conta.rotulo, email: conta.email, apagada });
    }
  }

  // --------------------------------------------------------------------
  // Relatorio.
  // --------------------------------------------------------------------
  console.log('\n=== Resultado ===');
  const largura = Math.max(...resultados.map((r) => r.nome.length), 10);
  for (const r of resultados) {
    console.log(`${r.ok ? 'PASSOU' : 'FALHOU'} | ${r.nome.padEnd(largura)} | ${r.detalhe}`);
  }
  const falhas = resultados.filter((r) => !r.ok);
  console.log(`\n${resultados.length - falhas.length}/${resultados.length} verificacoes passaram.`);

  console.log('\n=== Limpeza ===');
  for (const l of limpeza) {
    console.log(`${l.apagada ? 'APAGADA' : 'NAO APAGADA'} | conta ${l.rotulo} | ${l.email}`);
  }

  const limpezaFalhou = limpeza.some((l) => !l.apagada);
  if (erroDeExecucao || falhas.length > 0 || limpezaFalhou) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
