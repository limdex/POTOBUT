import type { PageServerLoad } from './$types';
import { getDb } from '$lib/server/db';
import type { TemplateDbRow, TemplateRecord } from '$lib/data/admin-types';

export const load: PageServerLoad = async () => {
	const db = getDb();
	const rows = db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all() as TemplateDbRow[];
	const templates: TemplateRecord[] = rows.map(r => ({
		...r,
		slots: JSON.parse(r.slots || '[]'),
		overlays: JSON.parse(r.overlays || '[]')
	}));
	return { templates };
};
