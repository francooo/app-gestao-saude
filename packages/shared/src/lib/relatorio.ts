import { addDays, differenceInCalendarDays, endOfDay, min as menor, startOfDay, subDays } from 'date-fns';

import type { Appointment, Dose, Medication, Profile, SymptomEntry } from '../api/health';
import { descricaoDoRegistro, TIPOS_DE_SINTOMA } from './diarioDeSintomas';
import { cmParaAltura, idadeDescrita, pesoTexto } from './pessoa';
import { doseNoSlot, hora, posologia, slotsDoDia, tituloDoMedicamento, vigenteHoje } from './posologia';

/**
 * O relatorio para levar ao medico.
 *
 * Modulo PURO, dividido pela web e pelo aplicativo:
 *  - `montarRelatorio` faz as contas (adesao, sintomas, consultas);
 *  - `relatorioEmHtml` desenha UM documento A4 — o mesmo HTML vira PDF na
 *    web (impressao do navegador) e no aplicativo (expo-print). Um modelo so
 *    para manter, e o que a pessoa ve na previa e o que sai no papel;
 *  - `dadosParaResumo` e o texto minimo que vai para a IA quando a pessoa
 *    assinante pede o resumo.
 *
 * Os numeros saem da mesma grade de horarios das outras telas (`slotsDoDia`,
 * `doseNoSlot`), entao o relatorio nunca discorda do historico do remedio.
 */

/** O maior periodo aceito. A busca e feita em blocos de ate 31 dias. */
export const DIAS_MAXIMOS_DO_RELATORIO = 90;
/** O teto da janela de doses da API (JANELA_MAXIMA_MS em apps/api). */
export const DIAS_POR_BLOCO = 31;

export type SecoesDoRelatorio = {
  encerrados: boolean;
  sintomas: boolean;
  consultas: boolean;
  /** A lista dose a dose. Longa: desligada por padrao. */
  historicoDeDoses: boolean;
};

export const SECOES_PADRAO: SecoesDoRelatorio = {
  encerrados: true,
  sintomas: true,
  consultas: true,
  historicoDeDoses: false,
};

export type EntradaDoRelatorio = {
  perfil: Profile;
  /** Os remedios da pessoa, com as doses do periodo (de todos os blocos juntos). */
  remedios: Medication[];
  sintomas: SymptomEntry[];
  consultas: Appointment[];
  inicio: Date;
  fim: Date;
  secoes: SecoesDoRelatorio;
  /** O texto que a IA escreveu, quando a pessoa pediu. */
  resumoIA?: string | null;
  agora: Date;
};

export type LinhaDeAdesao = {
  id: string;
  titulo: string;
  posologia: string;
  /** "se necessario" nao tem grade: so conta os usos. */
  seNecessario: boolean;
  previstas: number;
  tomadas: number;
  puladas: number;
  naoRegistradas: number;
  /** 0 a 100, ou null quando nao havia dose prevista. */
  percentual: number | null;
  usos: number;
};

export type RemedioDoRelatorio = {
  id: string;
  titulo: string;
  posologia: string;
  inicio: string | null;
  fim: string | null;
  prescritor: string | null;
  instrucoes: string | null;
  adesao: LinhaDeAdesao;
};

export type ResumoDeSintoma = {
  tipo: string;
  rotulo: string;
  registros: number;
  /** O pior momento: o maior degrau nos sintomas, o menor em humor e sono. */
  extremo: string;
  media: string;
  temperaturaMaxima: string | null;
};

export type Relatorio = {
  pessoa: {
    nome: string;
    idade: string | null;
    peso: string | null;
    altura: string | null;
    parentesco: string | null;
    observacoes: string | null;
  };
  periodo: { inicio: Date; fim: Date; texto: string; dias: number };
  geradoEm: Date;
  resumoIA: string | null;
  emUso: RemedioDoRelatorio[];
  encerrados: RemedioDoRelatorio[] | null;
  sintomas: { resumo: ResumoDeSintoma[]; linhaDoTempo: { quando: string; texto: string; nota: string | null }[]; total: number } | null;
  consultas: { noPeriodo: LinhaDeConsulta[]; proximas: LinhaDeConsulta[] } | null;
  historicoDeDoses: { quando: string; remedio: string; status: string }[] | null;
  /** Nada de remedio, sintoma ou consulta no periodo. */
  vazio: boolean;
};

export type LinhaDeConsulta = {
  quando: string;
  titulo: string;
  detalhe: string;
  situacao: string;
};

// ---------------------------------------------------------------------------
// Periodo
// ---------------------------------------------------------------------------

/** Os ultimos N dias, terminando hoje. */
export function periodoDosUltimos(dias: number, agora: Date): { inicio: Date; fim: Date } {
  return { inicio: startOfDay(subDays(agora, dias - 1)), fim: endOfDay(agora) };
}

/** Mensagem de erro de um periodo escolhido a mao, ou null se ele serve. */
export function erroDoPeriodo(inicio: Date, fim: Date, agora: Date): string | null {
  if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime())) return 'Informe as duas datas.';
  if (fim < inicio) return 'A data final vem antes da inicial.';
  if (startOfDay(inicio) > endOfDay(agora)) return 'O período começa no futuro.';
  if (differenceInCalendarDays(fim, inicio) + 1 > DIAS_MAXIMOS_DO_RELATORIO) {
    return `Escolha no máximo ${DIAS_MAXIMOS_DO_RELATORIO} dias.`;
  }
  return null;
}

/**
 * O periodo em blocos de ate 31 dias, para a busca de remedios.
 *
 * A API recusa janelas maiores (um bug no aplicativo nao pode baixar o
 * historico inteiro), entao 90 dias viram tres buscas.
 */
export function blocosDoPeriodo(inicio: Date, fim: Date): { de: Date; ate: Date }[] {
  const blocos: { de: Date; ate: Date }[] = [];
  let de = startOfDay(inicio);
  while (de <= fim) {
    const ate = menor([endOfDay(addDays(de, DIAS_POR_BLOCO - 2)), fim]);
    blocos.push({ de, ate });
    de = startOfDay(addDays(ate, 1));
  }
  return blocos;
}

/**
 * Junta as listas de remedios de varios blocos num remedio so por id, com as
 * doses de todos os blocos (sem repetir a mesma dose).
 */
export function juntarBlocos(listas: Medication[][]): Medication[] {
  const porId = new Map<string, Medication>();
  for (const lista of listas) {
    for (const m of lista) {
      const atual = porId.get(m.id);
      if (!atual) {
        porId.set(m.id, { ...m, doses: [...m.doses] });
        continue;
      }
      const ids = new Set(atual.doses.map((d) => d.id));
      atual.doses.push(...m.doses.filter((d) => !ids.has(d.id)));
    }
  }
  return [...porId.values()];
}

// ---------------------------------------------------------------------------
// Contas
// ---------------------------------------------------------------------------

/**
 * Doses previstas, tomadas, puladas e nao registradas no periodo.
 *
 * Os horarios futuros nao contam (o periodo termina hoje, mas a dose das 22h
 * ainda nao chegou). Para um tratamento PAUSADO sem data de fim, a grade vai
 * so ate a ultima dose registrada: o banco nao guarda quando ele foi pausado,
 * e contar como "nao registrada" cada dia depois da pausa acusaria a familia
 * de esquecer um remedio que ela parou de dar.
 */
export function adesaoNoPeriodo(m: Medication, inicio: Date, fim: Date, agora: Date): LinhaDeAdesao {
  const doPeriodo = m.doses.filter((d) => dentro(momentoDaDose(d), inicio, fim));
  const usos = doPeriodo.filter((d) => d.status === 'tomada').length;
  const base = {
    id: m.id,
    titulo: tituloDoMedicamento(m),
    posologia: posologia(m),
    usos,
  };

  if (m.scheduleType === 'as_needed') {
    return { ...base, seNecessario: true, previstas: 0, tomadas: usos, puladas: 0, naoRegistradas: 0, percentual: null };
  }

  let limite = menor([fim, agora]);
  if (!m.isActive && !m.endsAt) {
    const ultima = ultimaDose(m.doses);
    if (!ultima) {
      return { ...base, seNecessario: false, previstas: 0, tomadas: 0, puladas: 0, naoRegistradas: 0, percentual: null };
    }
    limite = menor([limite, ultima]);
  }

  let previstas = 0;
  let tomadas = 0;
  let puladas = 0;
  for (let dia = startOfDay(inicio); dia <= limite; dia = addDays(dia, 1)) {
    for (const slot of slotsDoDia(m, dia)) {
      if (slot < inicio || slot > limite) continue;
      previstas += 1;
      const dose = doseNoSlot(m, m.doses, slot);
      if (dose?.status === 'tomada') tomadas += 1;
      else if (dose?.status === 'pulada') puladas += 1;
    }
  }

  return {
    ...base,
    seNecessario: false,
    previstas,
    tomadas,
    puladas,
    naoRegistradas: Math.max(0, previstas - tomadas - puladas),
    percentual: previstas > 0 ? Math.round((tomadas / previstas) * 100) : null,
  };
}

function momentoDaDose(d: Dose): Date | null {
  const iso = d.takenAt ?? d.scheduledFor;
  return iso ? new Date(iso) : null;
}

function ultimaDose(doses: Dose[]): Date | null {
  let ultima: Date | null = null;
  for (const d of doses) {
    const q = momentoDaDose(d);
    if (q && (!ultima || q > ultima)) ultima = q;
  }
  return ultima;
}

function dentro(d: Date | null, inicio: Date, fim: Date): boolean {
  return d != null && d >= inicio && d <= fim;
}

function dataCurta(d: Date): string {
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function dataEHora(d: Date): string {
  return `${dataCurta(d)} às ${hora(d)}`;
}

function maiuscula(texto: string | null | undefined): string | null {
  if (!texto) return null;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

function numero(n: number, casas = 1): string {
  return n.toFixed(casas).replace('.', ',');
}

/** O tratamento teve alguma coisa a ver com o periodo (grade ou dose dentro dele). */
function tocaOPeriodo(m: Medication, inicio: Date, fim: Date, adesao: LinhaDeAdesao): boolean {
  if (adesao.previstas > 0 || adesao.usos > 0) return true;
  if (m.doses.some((d) => dentro(momentoDaDose(d), inicio, fim))) return true;
  return m.endsAt ? dentro(new Date(m.endsAt), inicio, fim) : false;
}

export function montarRelatorio(e: EntradaDoRelatorio): Relatorio {
  const { perfil, inicio, fim, agora, secoes } = e;
  const remedios = e.remedios.filter((m) => m.profileId === perfil.id);

  const comAdesao = remedios.map((m) => ({ m, adesao: adesaoNoPeriodo(m, inicio, fim, agora) }));
  const paraLinha = ({ m, adesao }: { m: Medication; adesao: LinhaDeAdesao }): RemedioDoRelatorio => ({
    id: m.id,
    titulo: tituloDoMedicamento(m),
    posologia: posologia(m),
    inicio: m.startsAt ? dataCurta(new Date(m.startsAt)) : null,
    fim: m.endsAt ? dataCurta(new Date(m.endsAt)) : null,
    prescritor: m.prescriberName ?? null,
    instrucoes: m.instructions?.trim() || null,
    adesao,
  });

  // "Em uso" e o que vale no fim do periodo; o resto que tocou o periodo e
  // tratamento encerrado (ou pausado) nele.
  const referencia = menor([fim, agora]);
  const emUso = comAdesao
    .filter(({ m }) => vigenteHoje(m, referencia))
    .sort((a, b) => a.adesao.titulo.localeCompare(b.adesao.titulo, 'pt-BR'))
    .map(paraLinha);
  const encerrados = comAdesao
    .filter(({ m, adesao }) => !vigenteHoje(m, referencia) && tocaOPeriodo(m, inicio, fim, adesao))
    .map(paraLinha);

  const sintomasDoPeriodo = e.sintomas
    .filter((s) => s.profileId === perfil.id && dentro(new Date(s.occurredAt), inicio, fim))
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));

  const consultasDaPessoa = e.consultas.filter((c) => c.profileId === perfil.id);

  const dias = differenceInCalendarDays(fim, inicio) + 1;
  const historico = secoes.historicoDeDoses
    ? remedios
        .flatMap((m) =>
          m.doses
            .filter((d) => dentro(momentoDaDose(d), inicio, fim))
            .map((d) => ({ d, titulo: tituloDoMedicamento(m), quando: momentoDaDose(d)! })),
        )
        .sort((a, b) => b.quando.getTime() - a.quando.getTime())
        .slice(0, 300)
        .map(({ d, titulo, quando }) => ({
          quando: dataEHora(quando),
          remedio: titulo,
          status: d.status === 'tomada' ? 'Tomada' : d.status === 'pulada' ? 'Pulada' : 'Atrasada',
        }))
    : null;

  const consultasNoPeriodo = consultasDaPessoa
    .filter((c) => dentro(new Date(c.scheduledAt), inicio, fim))
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  const proximas = consultasDaPessoa
    .filter((c) => new Date(c.scheduledAt) > agora && c.status === 'agendada')
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
    .slice(0, 5);

  return {
    pessoa: {
      nome: perfil.fullName,
      idade: idadeDescrita(perfil.birthDate),
      peso:
        perfil.weightKg != null
          ? `${pesoTexto(perfil.weightKg)} kg${perfil.weightMeasuredAt ? ` (anotado em ${dataCurta(new Date(perfil.weightMeasuredAt))})` : ''}`
          : null,
      altura: perfil.heightCm != null ? `${cmParaAltura(perfil.heightCm)} m` : null,
      parentesco: perfil.isAccountHolder ? null : maiuscula(perfil.relationship),
      observacoes: perfil.notes?.trim() || null,
    },
    periodo: {
      inicio,
      fim,
      dias,
      texto: `${dataCurta(inicio)} a ${dataCurta(fim)} (${dias} ${dias === 1 ? 'dia' : 'dias'})`,
    },
    geradoEm: agora,
    resumoIA: e.resumoIA?.trim() || null,
    emUso,
    encerrados: secoes.encerrados ? encerrados : null,
    sintomas: secoes.sintomas ? resumirSintomas(sintomasDoPeriodo) : null,
    consultas: secoes.consultas
      ? { noPeriodo: consultasNoPeriodo.map(linhaDeConsulta), proximas: proximas.map(linhaDeConsulta) }
      : null,
    historicoDeDoses: historico,
    vazio:
      emUso.length === 0 &&
      encerrados.length === 0 &&
      sintomasDoPeriodo.length === 0 &&
      consultasNoPeriodo.length === 0,
  };
}

function resumirSintomas(registros: SymptomEntry[]): NonNullable<Relatorio['sintomas']> {
  const resumo: ResumoDeSintoma[] = [];
  for (const t of TIPOS_DE_SINTOMA) {
    const doTipo = registros.filter((r) => r.kind === t.chave);
    if (doTipo.length === 0) continue;
    const valores = doTipo.map((r) => r.intensity);
    const extremo = t.direcao === 'pior' ? Math.max(...valores) : Math.min(...valores);
    const media = valores.reduce((a, b) => a + b, 0) / valores.length;
    const temperaturas = doTipo
      .map((r) => r.temperatureC)
      .filter((v): v is number => typeof v === 'number');
    resumo.push({
      tipo: t.chave,
      rotulo: t.rotulo,
      registros: doTipo.length,
      extremo: `${t.degraus[extremo - 1]} (${extremo} de 5)`,
      media: `${numero(media)} de 5`,
      temperaturaMaxima: temperaturas.length ? `${numero(Math.max(...temperaturas))} °C` : null,
    });
  }

  return {
    resumo,
    total: registros.length,
    linhaDoTempo: registros.slice(0, 30).map((r) => ({
      quando: dataEHora(new Date(r.occurredAt)),
      texto: descricaoDoRegistro(r),
      nota: r.note?.trim() || null,
    })),
  };
}

function linhaDeConsulta(c: Appointment): LinhaDeConsulta {
  const d = new Date(c.scheduledAt);
  const situacoes: Record<Appointment['status'], string> = {
    agendada: 'Agendada',
    realizada: 'Realizada',
    cancelada: 'Cancelada',
    faltou: 'Não compareceu',
  };
  return {
    quando: dataEHora(d),
    titulo: c.professionalName ?? c.title ?? 'Consulta',
    detalhe: [
      c.professionalSpecialty,
      c.modality === 'teleconsulta' ? 'Teleconsulta' : (c.location ?? null),
    ]
      .filter(Boolean)
      .join(' · '),
    situacao: situacoes[c.status],
  };
}

// ---------------------------------------------------------------------------
// Texto para a IA
// ---------------------------------------------------------------------------

/**
 * O minimo que a IA precisa para escrever o resumo: primeiro nome, idade, os
 * numeros do periodo. Sem foto, sem e-mail, sem sobrenome — e o que esta na
 * politica de privacidade.
 */
export function dadosParaResumo(r: Relatorio): string {
  const linhas: string[] = [];
  linhas.push(`Pessoa: ${r.pessoa.nome.split(' ')[0]}${r.pessoa.idade ? `, ${r.pessoa.idade}` : ''}`);
  if (r.pessoa.peso) linhas.push(`Peso: ${r.pessoa.peso}`);
  if (r.pessoa.observacoes) linhas.push(`Observações da ficha: ${r.pessoa.observacoes}`);
  linhas.push(`Período: ${r.periodo.texto}`);

  const remedio = (x: RemedioDoRelatorio) => {
    const a = x.adesao;
    const numeros = a.seNecessario
      ? `usado ${a.usos} vez(es)`
      : a.previstas > 0
        ? `${a.tomadas} de ${a.previstas} doses tomadas (${a.percentual}%), ${a.puladas} puladas, ${a.naoRegistradas} sem registro`
        : 'sem doses previstas no período';
    return `- ${x.titulo} — ${x.posologia}; ${numeros}`;
  };

  linhas.push('Medicamentos em uso:');
  linhas.push(...(r.emUso.length ? r.emUso.map(remedio) : ['- nenhum']));
  if (r.encerrados?.length) {
    linhas.push('Tratamentos encerrados ou pausados no período:');
    linhas.push(...r.encerrados.map(remedio));
  }
  if (r.sintomas) {
    linhas.push(`Sintomas registrados: ${r.sintomas.total}`);
    for (const s of r.sintomas.resumo) {
      linhas.push(
        `- ${s.rotulo}: ${s.registros} registro(s), média ${s.media}, extremo ${s.extremo}${s.temperaturaMaxima ? `, temperatura máxima ${s.temperaturaMaxima}` : ''}`,
      );
    }
  }
  if (r.consultas?.noPeriodo.length) {
    linhas.push('Consultas no período:');
    linhas.push(...r.consultas.noPeriodo.map((c) => `- ${c.quando}: ${c.titulo} (${c.situacao})`));
  }
  return linhas.join('\n');
}

// ---------------------------------------------------------------------------
// HTML (A4)
// ---------------------------------------------------------------------------

function esc(texto: string | null | undefined): string {
  return (texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** O coracao com as folhas (o logo Familia Saude), em linha no documento. */
const LOGO = `<svg viewBox="0 0 64 64" width="34" height="34" aria-hidden="true"><path d="M32 60C19 58 8 47 8 31c12 2 22 12 24 29Z" fill="#4c7745"/><path d="M32 60c13-2 24-13 24-29-12 2-22 12-24 29Z" fill="#a4bd88"/><path d="M32 42C13 30 11 14 22 10.8c5-1.5 9 1.4 10 5.2 1-3.8 5-6.7 10-5.2C53 14 51 30 32 42Z" fill="#5f8c50"/><path d="M32 32.5c-7.4-4.8-7.9-10.6-4.2-11.7 2-.6 3.7.7 4.2 2.2.5-1.5 2.2-2.8 4.2-2.2 3.7 1.1 3.2 6.9-4.2 11.7Z" fill="none" stroke="#f4f1dc" stroke-width="2"/></svg>`;

const CSS = `
@page { size: A4; margin: 16mm 14mm 18mm; @bottom-right { content: 'Página ' counter(page) ' de ' counter(pages); font-family: 'Segoe UI', Roboto, Arial, sans-serif; font-size: 8pt; color: #5d6c61; } }
* { box-sizing: border-box; }
html, body { margin: 0; }
@media screen { body { padding: 16mm 14mm; } }
body { font-family: 'Nunito', 'Segoe UI', Roboto, Arial, sans-serif; font-size: 11pt; line-height: 1.45; color: #27352b; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.folha { max-width: 182mm; margin: 0 auto; }
header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-bottom: 10px; border-bottom: 2px solid #3f5a45; }
.marca { display: flex; align-items: center; gap: 8px; font-weight: 800; font-size: 13pt; color: #4a6b45; }
.titulo { text-align: right; }
.titulo h1 { margin: 0; font-size: 17pt; color: #224a32; }
.titulo p { margin: 2px 0 0; font-size: 9.5pt; color: #5d6c61; }
.pessoa { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px 16px; margin: 12px 0 4px; padding: 10px 12px; border-radius: 10px; background: #eef3e9; }
.pessoa .nome { grid-column: 1 / -1; font-size: 14pt; font-weight: 800; color: #224a32; }
.rotulo { display: block; font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; color: #5d6c61; }
.obs { grid-column: 1 / -1; }
section { margin-top: 16px; break-inside: auto; }
h2 { margin: 0 0 6px; padding-bottom: 3px; font-size: 12.5pt; color: #224a32; border-bottom: 1px solid #b7c9ad; break-after: avoid; }
.ia { padding: 10px 12px; border-left: 4px solid #c9854b; border-radius: 6px; background: #fbf3e8; }
.ia .aviso { margin-top: 6px; font-size: 8.5pt; color: #7a5a3a; }
table { width: 100%; border-collapse: collapse; font-size: 10pt; }
th { padding: 5px 6px; text-align: left; font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; color: #3f5a45; background: #eef3e9; }
td { padding: 6px; vertical-align: top; border-bottom: 1px solid #e3e8dc; }
tr { break-inside: avoid; }
.num { text-align: right; white-space: nowrap; }
.sub { display: block; margin-top: 1px; font-size: 9pt; color: #5d6c61; }
.boa { color: #2f6b47; font-weight: 700; }
.media { color: #8a5a10; font-weight: 700; }
.baixa { color: #9a3f38; font-weight: 700; }
.vazio { padding: 8px 0; color: #5d6c61; font-style: italic; }
footer { margin-top: 22px; padding-top: 8px; border-top: 1px solid #b7c9ad; font-size: 8.5pt; color: #5d6c61; }
.nada { margin-top: 24px; padding: 18px; border: 1px dashed #b7c9ad; border-radius: 10px; text-align: center; color: #5d6c61; }
`;

function classeDoPercentual(p: number | null): string {
  if (p == null) return '';
  if (p >= 80) return 'boa';
  if (p >= 50) return 'media';
  return 'baixa';
}

function tabelaDeRemedios(lista: RemedioDoRelatorio[], comDetalhes: boolean): string {
  if (!lista.length) return '<p class="vazio">Nenhum.</p>';
  const linhas = lista
    .map((x) => {
      const a = x.adesao;
      const detalhes = comDetalhes
        ? [
            x.inicio ? `Início: ${esc(x.inicio)}` : null,
            x.fim ? `Fim: ${esc(x.fim)}` : null,
            x.prescritor ? `Receitado por ${esc(x.prescritor)}` : null,
          ].filter(Boolean)
        : [];
      const adesao = a.seNecessario
        ? `<td class="num">—</td><td class="num">${a.usos} ${a.usos === 1 ? 'uso' : 'usos'}</td><td class="num">—</td><td class="num">—</td>`
        : a.previstas === 0
          ? `<td class="num">0</td><td class="num">${a.tomadas}</td><td class="num">—</td><td class="num">—</td>`
          : `<td class="num">${a.previstas}</td><td class="num">${a.tomadas}</td><td class="num">${a.puladas} / ${a.naoRegistradas}</td><td class="num ${classeDoPercentual(a.percentual)}">${a.percentual}%</td>`;
      return `<tr><td><strong>${esc(x.titulo)}</strong><span class="sub">${esc(x.posologia)}</span>${
        detalhes.length ? `<span class="sub">${detalhes.join(' · ')}</span>` : ''
      }${x.instrucoes ? `<span class="sub">Orientação: ${esc(x.instrucoes)}</span>` : ''}</td>${adesao}</tr>`;
    })
    .join('');
  return `<table><thead><tr><th>Medicamento</th><th class="num">Previstas</th><th class="num">Tomadas</th><th class="num">Puladas / sem registro</th><th class="num">Adesão</th></tr></thead><tbody>${linhas}</tbody></table>`;
}

/**
 * O documento inteiro, pronto para imprimir ou virar PDF.
 *
 * CSS proprio e em linha, com as cores da marca em valor fixo: o documento
 * vive fora do site (no PDF, no WhatsApp do medico) e nao pode depender das
 * variaveis da pagina.
 */
export function relatorioEmHtml(r: Relatorio): string {
  const p = r.pessoa;
  const dado = (rotulo: string, valor: string | null) =>
    valor ? `<div><span class="rotulo">${rotulo}</span>${esc(valor)}</div>` : '';

  const partes: string[] = [];

  partes.push(`<header><div class="marca">${LOGO}Família Saúde</div><div class="titulo"><h1>Relatório de saúde</h1><p>${esc(r.periodo.texto)}</p></div></header>`);

  partes.push(
    `<div class="pessoa"><div class="nome">${esc(p.nome)}</div>${dado('Idade', p.idade)}${dado('Peso', p.peso)}${dado('Altura', p.altura)}${dado('Parentesco', p.parentesco)}${
      p.observacoes ? `<div class="obs"><span class="rotulo">Observações</span>${esc(p.observacoes)}</div>` : ''
    }</div>`,
  );

  if (r.resumoIA) {
    partes.push(
      `<section><h2>Resumo</h2><div class="ia">${esc(r.resumoIA).replace(/\n/g, '<br>')}<div class="aviso">Resumo gerado por inteligência artificial a partir dos registros abaixo. Confira com os dados.</div></div></section>`,
    );
  }

  if (r.vazio) {
    partes.push('<div class="nada">Nada registrado neste período: nenhum remédio, sintoma ou consulta.</div>');
  }

  partes.push(`<section><h2>Medicamentos em uso</h2>${tabelaDeRemedios(r.emUso, true)}</section>`);

  if (r.encerrados && r.encerrados.length) {
    partes.push(`<section><h2>Tratamentos encerrados ou pausados no período</h2>${tabelaDeRemedios(r.encerrados, true)}</section>`);
  }

  if (r.sintomas) {
    const s = r.sintomas;
    const resumo = s.resumo.length
      ? `<table><thead><tr><th>Sintoma</th><th class="num">Registros</th><th>Média</th><th>Pior momento</th></tr></thead><tbody>${s.resumo
          .map(
            (x) =>
              `<tr><td><strong>${esc(x.rotulo)}</strong>${x.temperaturaMaxima ? `<span class="sub">Temperatura máxima: ${esc(x.temperaturaMaxima)}</span>` : ''}</td><td class="num">${x.registros}</td><td>${esc(x.media)}</td><td>${esc(x.extremo)}</td></tr>`,
          )
          .join('')}</tbody></table>`
      : '<p class="vazio">Nenhum sintoma registrado no período.</p>';
    const linha = s.linhaDoTempo.length
      ? `<table style="margin-top:8px"><thead><tr><th>Quando</th><th>Registro</th></tr></thead><tbody>${s.linhaDoTempo
          .map(
            (x) =>
              `<tr><td style="white-space:nowrap">${esc(x.quando)}</td><td>${esc(x.texto)}${x.nota ? `<span class="sub">${esc(x.nota)}</span>` : ''}</td></tr>`,
          )
          .join('')}</tbody></table>${s.total > s.linhaDoTempo.length ? `<p class="vazio">Mostrando os ${s.linhaDoTempo.length} registros mais recentes de ${s.total}.</p>` : ''}`
      : '';
    partes.push(`<section><h2>Sintomas</h2>${resumo}${linha}</section>`);
  }

  if (r.consultas) {
    const tabela = (lista: LinhaDeConsulta[]) =>
      lista.length
        ? `<table><thead><tr><th>Quando</th><th>Consulta</th><th>Situação</th></tr></thead><tbody>${lista
            .map(
              (c) =>
                `<tr><td style="white-space:nowrap">${esc(c.quando)}</td><td><strong>${esc(c.titulo)}</strong>${c.detalhe ? `<span class="sub">${esc(c.detalhe)}</span>` : ''}</td><td>${esc(c.situacao)}</td></tr>`,
            )
            .join('')}</tbody></table>`
        : '<p class="vazio">Nenhuma.</p>';
    partes.push(`<section><h2>Consultas no período</h2>${tabela(r.consultas.noPeriodo)}</section>`);
    if (r.consultas.proximas.length) {
      partes.push(`<section><h2>Próximas consultas</h2>${tabela(r.consultas.proximas)}</section>`);
    }
  }

  if (r.historicoDeDoses) {
    const h = r.historicoDeDoses;
    partes.push(
      `<section><h2>Histórico de doses</h2>${
        h.length
          ? `<table><thead><tr><th>Quando</th><th>Medicamento</th><th>Situação</th></tr></thead><tbody>${h
              .map((x) => `<tr><td style="white-space:nowrap">${esc(x.quando)}</td><td>${esc(x.remedio)}</td><td>${esc(x.status)}</td></tr>`)
              .join('')}</tbody></table>`
          : '<p class="vazio">Nenhuma dose registrada no período.</p>'
      }</section>`,
    );
  }

  partes.push(
    `<footer>Informações registradas pela família no aplicativo Família Saúde. Não substitui avaliação médica. Gerado em ${esc(dataEHora(r.geradoEm))}.</footer>`,
  );

  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(`Relatório de saúde — ${p.nome}`)}</title><style>${CSS}</style></head><body><div class="folha">${partes.join('')}</div></body></html>`;
}

