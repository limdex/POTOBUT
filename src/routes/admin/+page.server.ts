import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const rows = db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all() as any[];
	const templates = rows.map(r => ({
		...r,
		slots: JSON.parse(r.slots || '[]'),
		overlays: JSON.parse(r.overlays || '[]')
	}));
	return { templates };
};
