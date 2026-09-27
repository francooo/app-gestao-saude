/** Provas do normalizador da leitura. Temporario. */
import {
  consumirCadastroConcluido,
  consumirRascunho,
  guardarRascunho,
  marcarCadastroConcluido,
  normalizarLeitura,
  temCadastroConcluido,
} from './src/lib/rascunhoDeMedicamento';

let falhas = 0;
function eq(nome: string, obtido: unknown, esperado: unknown) {
  const a = JSON.stringify(obtido);
  const b = JSON.stringify(esperado);
  if (a !== b) {
    falhas++;
    console.log(`  X ${nome}\n      obtido:   ${a}\n      esperado: ${b}`);
  } else console.log(`  . ${nome}`);
}

const base = {
  index: 0,
  name: 'Amoxicilna',
  strength: null,
  form: null,
  doseAmount: null,
  doseUnit: null,
  packageAmount: null,
  scheduleType: null,
  intervalHours: null,
  times: [] as string[],
  durationDays: null,
  instructions: null,
};

console.log('\n# Marcacao: so o que veio MESMO da leitura');
{
  const r = normalizarLeitura(base as never);
  eq('nome preservado', r.campos.nome, 'Amoxicilna');
  eq('so o nome marcado', r.camposLidos, ['nome']);
  eq('forma cai no padrao SEM ser marcada', [r.campos.forma, r.camposLidos.includes('forma')], ['cápsula', false]);
  eq('tipo cai no padrao SEM ser marcado', [r.campos.tipo, r.camposLidos.includes('tipo')], ['interval', false]);

  const f = normalizarLeitura({ ...base, form: 'comprimidos' } as never);
  eq('forma que casa e marcada', [f.campos.forma, f.camposLidos.includes('forma')], ['comprimido', true]);

  const x = normalizarLeitura({ ...base, form: 'adesivo' } as never);
  eq('forma desconhecida nao marca', [x.campos.forma, x.camposLidos.includes('forma')], ['cápsula', false]);
}

console.log('\n# Intervalo encaixa no degrau oferecido');
{
  // Empates (5, 7, 10) vao para o MAIOR de proposito: arredondar para baixo
  // faria tomar mais vezes por dia do que a receita pediu.
  for (const [entrada, esperado] of [[5, 6], [8, 8], [7, 8], [10, 12], [9, 8], [20, 24], [72, 24]] as [number, number][]) {
    const r = normalizarLeitura({ ...base, scheduleType: 'interval', intervalHours: entrada } as never);
    eq(`${entrada}h -> ${esperado}h`, r.campos.intervalo, esperado);
  }
}

console.log('\n# Horarios');
{
  const r = normalizarLeitura({ ...base, scheduleType: 'fixed_times', times: ['08:00', '20:00', '99:99'] } as never);
  eq('invalido some', r.campos.horarios, ['08:00', '20:00']);
  eq('marcado', r.camposLidos.includes('horarios'), true);

  const v = normalizarLeitura({ ...base, scheduleType: 'fixed_times', times: [] } as never);
  eq('sem horario valido, mantem o padrao e NAO marca',
    [v.campos.horarios, v.camposLidos.includes('horarios')], [['08:00'], false]);

  const n = normalizarLeitura({ ...base, scheduleType: 'as_needed' } as never);
  eq('as_needed', n.campos.tipo, 'as_needed');
}

console.log('\n# Duracao vira data com o relogio do APARELHO');
{
  const agora = new Date('2026-09-27T21:30:00-03:00');
  const r = normalizarLeitura({ ...base, durationDays: 7 } as never, agora);
  const fim = new Date(r.campos.fimDoTratamento!);
  eq('7 dias a frente, no dia local certo', fim.toISOString().slice(0, 10), '2026-10-05');
  eq('sem duracao, sem data', normalizarLeitura(base as never).campos.fimDoTratamento, null);
}

console.log('\n# A vaga do rascunho');
{
  const r = { campos: normalizarLeitura(base as never).campos, camposLidos: [], foto: 'x', kind: 'receita' as const, readId: 'r', readItem: 0, prescritorId: null };
  const t1 = guardarRascunho(r);
  eq('token errado devolve null', consumirRascunho('nao-existe'), null);
  eq('token errado NAO esvazia a vaga', consumirRascunho(t1) !== null, true);
  eq('consumir esvazia', consumirRascunho(t1), null);

  guardarRascunho(r);
  const t3 = guardarRascunho({ ...r, readId: 'novo' });
  eq('uma vaga so: o novo vence', consumirRascunho(t3)?.readId, 'novo');
}

console.log('\n# A marca de cadastro concluido');
{
  eq('comeca limpa', temCadastroConcluido(), false);
  marcarCadastroConcluido();
  eq('espiar nao consome', [temCadastroConcluido(), temCadastroConcluido()], [true, true]);
  eq('consumir devolve e limpa', [consumirCadastroConcluido(), temCadastroConcluido()], [true, false]);
}

console.log(falhas === 0 ? '\nTUDO PASSOU' : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
