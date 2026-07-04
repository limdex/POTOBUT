import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async ({ url }) => {
	const id = url.searchParams.get('id');
	if (!id) return { template: null };

	const db = getDb();
	const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(id)) as any;
	if (!row) return { template: null };

	return {
		template: {
			...row,
			slots: JSON.parse(row.slots || '[]'),
			overlays: JSON.parse(row.overlays || '[]')
		}
	};
};
