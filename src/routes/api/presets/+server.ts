import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getAllCanvasPresets, addCanvasPresetDb } from '$lib/server/db';

export const GET: RequestHandler = async () => {
	const presets = getAllCanvasPresets();
	return json(presets);
};

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	const { width, height } = body;

	if (!width || !height || width <= 0 || height <= 0) {
		return json({ error: 'Valid width and height are required' }, { status: 400 });
	}

	const created = addCanvasPresetDb(Number(width), Number(height));
	if (!created) {
		return json({ error: 'Maximum 10 presets reached' }, { status: 400 });
	}

	return json(created, { status: 201 });
};
