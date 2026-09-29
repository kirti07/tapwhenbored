// The Tap Clash room API on Vercel: GET /api/clash/?r=CODE, POST /api/clash/.
// Everything lives in api/_lib/clash.js; this file only binds it to Upstash.

import { createHandler } from "../_lib/clash.js";
import { pipeline } from "../_lib/redis.js";

const handle = createHandler({ store: { pipeline } });

export const GET = handle;
export const POST = handle;
