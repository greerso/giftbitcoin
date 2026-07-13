/**
 * Outbound mail via AWS SES (SESv2 HTTP API + SigV4).
 * Replaces Cloudflare Email Sending — account already has production SES on greerso.com.
 */
import { AwsClient } from 'aws4fetch';
import type { EmailSendParams, SendEnv } from './types';

/** Send one transactional email. Throws on non-2xx (caller maps to send_failed). */
export async function sendViaSes(env: SendEnv, msg: EmailSendParams): Promise<{ messageId?: string }> {
	const region = env.AWS_REGION || 'us-east-1';
	const accessKeyId = env.AWS_ACCESS_KEY_ID;
	const secretAccessKey = env.AWS_SECRET_ACCESS_KEY;
	if (!accessKeyId || !secretAccessKey) {
		throw new Error('ses_credentials_missing');
	}

	const aws = new AwsClient({
		accessKeyId,
		secretAccessKey,
		region,
		service: 'ses'
	});

	const fromAddr = msg.from.name
		? `${msg.from.name} <${msg.from.email}>`
		: msg.from.email;

	const res = await aws.fetch(`https://email.${region}.amazonaws.com/v2/email/outbound-emails`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			FromEmailAddress: fromAddr,
			Destination: { ToAddresses: [msg.to] },
			Content: {
				Simple: {
					Subject: { Data: msg.subject, Charset: 'UTF-8' },
					Body: {
						Html: { Data: msg.html, Charset: 'UTF-8' },
						Text: { Data: msg.text, Charset: 'UTF-8' }
					}
				}
			}
		})
	});

	if (!res.ok) {
		// Do not include body in thrown message (may echo recipient/link).
		throw new Error(`ses_http_${res.status}`);
	}
	const out = (await res.json().catch(() => ({}))) as { MessageId?: string };
	return { messageId: out.MessageId };
}
