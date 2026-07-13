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
	/**
	 * Optional injectable mailer (unit tests). Production uses SES via
	 * AWS_* secrets + sendViaSes — no Cloudflare Email Sending binding.
	 */
	EMAIL?: { send(msg: EmailSendParams): Promise<{ messageId?: string }> };
	IP_LIMIT: RateLimit;
	ADDR_LIMIT: RateLimit;
	/** Turnstile secret — wrangler secret, never in vars */
	TURNSTILE_SECRET: string;
	/** SES credentials — wrangler secrets */
	AWS_ACCESS_KEY_ID: string;
	AWS_SECRET_ACCESS_KEY: string;
	AWS_REGION: string;
	ALLOWED_ORIGIN: string;
	/** Must be a SES-verified identity (currently gifts@greerso.com). */
	FROM_EMAIL: string;
	ESPLORA_BASE: string;
}
