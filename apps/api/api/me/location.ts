import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { API_ERROR } from '../../src/contracts';
import { db } from '../../src/db/client';
import { users } from '../../src/db/schema';
import { requireAuth } from '../../src/lib/auth';
import { fail, json, parseBody, withErrorHandling } from '../../src/lib/http';
import { geocodificar, geocodificarReverso } from '../../src/lib/geocoding';

/**
 * Ponto de referencia das distancias ate os consultorios.
 *
 * Duas formas de definir:
 *   { address }            -> geocodifica e fixa um endereco ("minha casa")
 *   { latitude, longitude } -> usa a posicao atual, com rotulo pelo reverso
 *   { clear: true }        -> volta a nao ter referencia fixada
 *
 * A geocodificacao roda aqui, no servidor, com a chave privada do MapTiler —
 * a chave embutida no app serve so para desenhar o mapa.
 */
const bodySchema = z.union([
  z.object({ address: z.string().trim().min(5).max(300) }),
  z.object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  }),
  z.object({ clear: z.literal(true) }),
]);

export default withErrorHandling(async (req: VercelRequest, res: VercelResponse) => {
  const auth = await requireAuth(req, res);
  if (!auth) return;

  if (req.method === 'GET') {
    const [u] = await db
      .select({
        label: users.referenceLabel,
        address: users.referenceAddress,
        latitude: users.referenceLatitude,
        longitude: users.referenceLongitude,
      })
      .from(users)
      .where(eq(users.id, auth.userId))
      .limit(1);

    return json(res, 200, { location: serializar(u) });
  }

  if (req.method === 'PUT') {
    const body = parseBody(res, bodySchema, req.body);
    if (!body) return;

    if ('clear' in body) {
      const [u] = await db
        .update(users)
        .set({
          referenceLabel: null,
          referenceAddress: null,
          referenceLatitude: null,
          referenceLongitude: null,
          updatedAt: new Date(),
        })
        .where(eq(users.id, auth.userId))
        .returning({
          label: users.referenceLabel,
          address: users.referenceAddress,
          latitude: users.referenceLatitude,
          longitude: users.referenceLongitude,
        });

      return json(res, 200, { location: serializar(u) });
    }

    let label: string | null;
    let address: string | null;
    let latitude: number;
    let longitude: number;

    if ('address' in body) {
      const coords = await geocodificar(body.address);
      // Sem coordenada nao ha referencia util: as distancias sairiam erradas
      // em silencio, que e pior do que recusar.
      if (!coords) return fail(res, 422, API_ERROR.VALIDATION_ERROR);

      latitude = coords.latitude;
      longitude = coords.longitude;
      address = body.address;
      label = (await geocodificarReverso(latitude, longitude)) ?? body.address;
    } else {
      latitude = body.latitude;
      longitude = body.longitude;
      address = null;
      label = await geocodificarReverso(latitude, longitude);
    }

    const [u] = await db
      .update(users)
      .set({
        referenceLabel: label,
        referenceAddress: address,
        referenceLatitude: String(latitude),
        referenceLongitude: String(longitude),
        updatedAt: new Date(),
      })
      .where(eq(users.id, auth.userId))
      .returning({
        label: users.referenceLabel,
        address: users.referenceAddress,
        latitude: users.referenceLatitude,
        longitude: users.referenceLongitude,
      });

    return json(res, 200, { location: serializar(u) });
  }

  res.setHeader('Allow', 'GET, PUT');
  return fail(res, 405, API_ERROR.METHOD_NOT_ALLOWED);
});

/** numeric do Postgres chega como string no driver. */
function serializar(
  u:
    | { label: string | null; address: string | null; latitude: string | null; longitude: string | null }
    | undefined,
) {
  if (!u) return null;
  return {
    label: u.label,
    address: u.address,
    latitude: u.latitude === null ? null : Number(u.latitude),
    longitude: u.longitude === null ? null : Number(u.longitude),
  };
}
