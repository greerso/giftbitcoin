// worker/src/index.ts
import { handleSend } from './send';
import type { SendEnv } from './types';

export default {
	async fetch(request: Request, env: SendEnv): Promise<Response> {
		return handleSend(request, env);
	}
};
