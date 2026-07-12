import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { prepareCapture } from '$lib/server/camera';

export const POST: RequestHandler = async () => {
	await prepareCapture();
	return json({ ok: true });
};
