import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteCanvasPresetDb } from '$lib/server/db';

export const DELETE: RequestHandler = async ({ params }) => {
	const id = Number(params.id);
	if (!id) return json({ error: 'Invalid ID' }, { status: 400 });

	const ok = deleteCanvasPresetDb(id);
	return json({ ok });
};
