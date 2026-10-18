/**
 * Envio de WhatsApp — o UNICO arquivo que conhece o provedor.
 *
 * O provedor escolhido e NAO OFICIAL (Z-API, ou Evolution como alternativa):
 * conecta um WhatsApp comum por QR code. Funciona, mas viola os termos do
 * WhatsApp, e o numero pode ser bloqueado a qualquer momento. Por isso tudo
 * passa por `enviarTexto`: trocar pela API oficial (Meta Cloud API) e reescrever
 * este arquivo, e so ele.
 *
 * NUNCA registra o texto em log: e dado de saude (nome do paciente, remedio,
 * horario), e os logs da Vercel ficam fora do Brasil.
 */

export type ResultadoEnvio = { ok: true } | { ok: false; motivo: string };

/** Prazo de um envio. O agendador manda varios por minuto; nenhum pode travar. */
const PRAZO_MS = 8_000;

/**
 * Telefone BR para o formato do provedor: so digitos, com DDI 55.
 *
 * Aceita "(11) 99999-1234", "11999991234", "+55 11 99999-1234". Devolve null
 * para o que nao tem cara de celular brasileiro (10 ou 11 digitos com DDD).
 */
export function normalizarTelefone(entrada: string): string | null {
  let d = entrada.replace(/\D/g, '');
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2);
  if (d.length !== 10 && d.length !== 11) return null;
  if (d.startsWith('0')) return null;
  return `55${d}`;
}

export function whatsappConfigurado(): boolean {
  return provedor() !== null;
}

type Provedor =
  | { tipo: 'zapi'; instancia: string; token: string; clientToken: string | undefined }
  | { tipo: 'evolution'; url: string; instancia: string; apiKey: string };

function provedor(): Provedor | null {
  const { ZAPI_INSTANCE_ID, ZAPI_TOKEN, ZAPI_CLIENT_TOKEN } = process.env;
  if (ZAPI_INSTANCE_ID && ZAPI_TOKEN) {
    return { tipo: 'zapi', instancia: ZAPI_INSTANCE_ID, token: ZAPI_TOKEN, clientToken: ZAPI_CLIENT_TOKEN };
  }
  const { EVOLUTION_URL, EVOLUTION_INSTANCE, EVOLUTION_API_KEY } = process.env;
  if (EVOLUTION_URL && EVOLUTION_INSTANCE && EVOLUTION_API_KEY) {
    return { tipo: 'evolution', url: EVOLUTION_URL, instancia: EVOLUTION_INSTANCE, apiKey: EVOLUTION_API_KEY };
  }
  return null;
}

export async function enviarTexto(telefone: string, texto: string): Promise<ResultadoEnvio> {
  const p = provedor();
  if (!p) {
    console.error('[whatsapp] provedor nao configurado (ZAPI_* ou EVOLUTION_*)');
    return { ok: false, motivo: 'nao-configurado' };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PRAZO_MS);

  try {
    const r =
      p.tipo === 'zapi'
        ? await fetch(`https://api.z-api.io/instances/${p.instancia}/token/${p.token}/send-text`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(p.clientToken ? { 'Client-Token': p.clientToken } : {}),
            },
            body: JSON.stringify({ phone: telefone, message: texto }),
            signal: controller.signal,
          })
        : await fetch(`${p.url.replace(/\/$/, '')}/message/sendText/${p.instancia}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: p.apiKey },
            body: JSON.stringify({ number: telefone, text: texto }),
            signal: controller.signal,
          });

    if (!r.ok) {
      // So o status: o corpo de erro do provedor pode ecoar a mensagem.
      console.error('[whatsapp] provedor respondeu', r.status);
      return { ok: false, motivo: `http-${r.status}` };
    }
    return { ok: true };
  } catch (erro) {
    const abortou = erro instanceof Error && erro.name === 'AbortError';
    console.error('[whatsapp] falha ao enviar', { tempo: abortou });
    return { ok: false, motivo: abortou ? 'tempo' : 'rede' };
  } finally {
    clearTimeout(timer);
  }
}
