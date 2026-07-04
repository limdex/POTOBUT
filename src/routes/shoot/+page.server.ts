import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ url }) => {
	const id = url.searchParams.get('template');
	if (!id) throw redirect(302, '/');

	const db = getDb();
	const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(id)) as any;
	if (!row) throw redirect(302, '/');

	const template = {
		...row,
		slots: JSON.parse(row.slots || '[]'),
		overlays: JSON.parse(row.overlays || '[]')
	};

	return { template };
};
