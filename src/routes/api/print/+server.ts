import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { printImage, getPrinterStatus } from '$lib/server/printer';

export const POST: RequestHandler = async ({ request }) => {
	console.log('[PRINT] CETAK request received');
	const status = getPrinterStatus();
	console.log('[PRINT] Printer status:', status);

	if (!status.connected) {
		console.log('[PRINT] Error: Printer not connected');
		return json({ ok: false, error: 'Printer not connected' }, { status: 400 });
	}

	const { image } = await request.json();
	if (!image) {
		console.log('[PRINT] Error: No image data provided');
		return json({ ok: false, error: 'No image data' }, { status: 400 });
	}

	console.log('[PRINT] Processing image...');
	const buf = Buffer.from(image.split(',')[1], 'base64');
	console.log('[PRINT] Image size:', buf.length, 'bytes');

	const result = await printImage(buf);
	console.log('[PRINT] Print result:', result);
	return json(result);
};
