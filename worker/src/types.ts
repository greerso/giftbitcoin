// worker/src/types.ts — minimal shapes for the bindings /api/send uses.
export interface RateLimit {
	limit(opts: { key: string }): Promise<{ success: boolean }>;
}
export interface EmailSendParams {
	to: string;
	from: { email: string; name: string };
	subject: string;
	html: string;
	text: string;
}
export interface SendEnv {
	EMAIL: { send(msg: EmailSendParams): Promise<{ messageId?: string }> };
	IP_LIMIT: RateLimit;
	ADDR_LIMIT: RateLimit;
	/** Turnstile secret — wrangler secret, never in vars */
	TURNSTILE_SECRET: string;
	ALLOWED_ORIGIN: string;
	FROM_EMAIL: string;
	ESPLORA_BASE: string;
}
