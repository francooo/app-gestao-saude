import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isRateLimited } from '../../src/lib/rateLimit';

export default function handler(_req: VercelRequest, res: VercelResponse) {
  res.status(200).json({ modulo: 'lib/rateLimit', carregou: typeof isRateLimited });
}
