import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { deleteSlotPresetDb } from '$lib/server/db';

export const DELETE: RequestHandler = async ({ params }) => {
	const ok = deleteSlotPresetDb(Number(params.id));
	if (!ok) {
		return json({ error: 'Not found' }, { status: 404 });
	}
	return json({ ok: true });
};
