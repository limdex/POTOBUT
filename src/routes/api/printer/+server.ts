import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getPrinterStatus, connectPrinter, disconnectPrinter } from '$lib/server/printer';

export const GET: RequestHandler = async () => {
	const status = getPrinterStatus();
	console.log('[PRINTER] Status check:', status);
	return json(status);
};

export const POST: RequestHandler = async ({ request }) => {
	let name: string | undefined;
	try {
		const body = await request.json();
		name = body.name;
	} catch {
		// no body, use auto-select
	}
	console.log('[PRINTER] Connecting to:', name || '(auto)');
	const result = await connectPrinter(name);
	console.log('[PRINTER] Connect result:', result);
	return json(result);
};

export const DELETE: RequestHandler = async () => {
	console.log('[PRINTER] Disconnecting...');
	const result = disconnectPrinter();
	console.log('[PRINTER] Disconnect result:', result);
	return json(result);
};
