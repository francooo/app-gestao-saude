/**
 * Formatos do DS: data "12 nov 2026", numero "1.248", percentual "87,4%".
 * Tudo no fuso de Sao Paulo, o mesmo das consultas do servidor.
 */
const FUSO = 'America/Sao_Paulo';

const NUMERO = new Intl.NumberFormat('pt-BR');
const PERCENTUAL = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const HORA = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO });
const DIA_DO_FUSO = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }); // AAAA-MM-DD
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export const numero = (n: number) => NUMERO.format(n);

export const percentual = (fracao: number) => PERCENTUAL.format(fracao);

/** Dia de calendario (AAAA-MM-DD) de um instante, no fuso do painel. */
const diaDe = (instante: Date) => DIA_DO_FUSO.format(instante);

function diasEntre(diaA: string, diaB: string): number {
  return Math.round((Date.parse(`${diaB}T00:00:00Z`) - Date.parse(`${diaA}T00:00:00Z`)) / 86_400_000);
}

/** "2026-11-12" ou ISO completo -> "12 nov 2026". */
export function data(valor: string | null | undefined): string {
  if (!valor) return '—';
  const dia = valor.length === 10 ? valor : diaDe(new Date(valor));
  const [ano, mes, d] = dia.split('-');
  return `${Number(d)} ${MESES[Number(mes) - 1]} ${ano}`;
}

/** "2026-09" -> "set". */
export const mesCurto = (anoMes: string) => MESES[Number(anoMes.slice(5, 7)) - 1] ?? anoMes;

/** Ultimo acesso: "Hoje, 08:42", "Ontem, 19:10", "Há 3 dias" ou a data. */
export function ultimoAcesso(iso: string | null): string {
  if (!iso) return 'Nunca acessou';
  const instante = new Date(iso);
  const dias = diasEntre(diaDe(instante), diaDe(new Date()));
  if (dias <= 0) return `Hoje, ${HORA.format(instante)}`;
  if (dias === 1) return `Ontem, ${HORA.format(instante)}`;
  if (dias < 30) return `Há ${dias} dias`;
  return data(iso);
}

/** "há 5 min", "há 2 horas", "há 3 dias". */
export function haQuanto(iso: string): string {
  const minutos = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (minutos < 1) return 'agora';
  if (minutos < 60) return `há ${minutos} min`;
  const horas = Math.round(minutos / 60);
  if (horas < 24) return `há ${horas} ${horas === 1 ? 'hora' : 'horas'}`;
  const dias = Math.round(horas / 24);
  if (dias < 30) return `há ${dias} ${dias === 1 ? 'dia' : 'dias'}`;
  return data(iso);
}

/** Dias de hoje ate o instante (negativo = ja passou). */
export function diasAte(iso: string): number {
  return diasEntre(diaDe(new Date()), diaDe(new Date(iso)));
}

/** Idade em anos a partir de "AAAA-MM-DD". */
export function idade(nascimento: string | null): string {
  if (!nascimento) return '—';
  const [a, m, d] = nascimento.split('-').map(Number);
  const [ha, hm, hd] = diaDe(new Date()).split('-').map(Number);
  if (!a || !m || !d || !ha || !hm || !hd) return '—';
  const anos = ha - a - (hm < m || (hm === m && hd < d) ? 1 : 0);
  return anos === 1 ? '1 ano' : `${anos} anos`;
}

/** Iniciais para avatar: "Ana Clara Rocha" -> "AR". */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  const primeira = partes[0]![0] ?? '';
  const ultima = partes.length > 1 ? (partes.at(-1)![0] ?? '') : '';
  return (primeira + ultima).toUpperCase();
}
