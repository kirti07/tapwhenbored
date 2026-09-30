// The Tap Party room API on Vercel: GET /api/party/?r=CODE, POST /api/party/.
// Everything lives in api/_lib/party.js; this file only binds it to Upstash.

import { createHandler } from "../_lib/party.js";
import { pipeline } from "../_lib/redis.js";

const handle = createHandler({ store: { pipeline } });

export const GET = handle;
export const POST = handle;
