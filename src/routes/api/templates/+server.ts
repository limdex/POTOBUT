import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';
import type { Slot, Overlay } from '$lib/data/admin-types';

export const GET: RequestHandler = async () => {
	const db = getDb();
	const rows = db.prepare('SELECT * FROM templates ORDER BY updated_at DESC').all() as any[];
	const templates = rows.map(r => ({
		...r,
		slots: JSON.parse(r.slots || '[]'),
		overlays: JSON.parse(r.overlays || '[]')
	}));
	return json(templates);
};

export const POST: RequestHandler = async ({ request }) => {
	const db = getDb();
	const body = await request.json();
	const {
		name = 'Template Baru',
		canvas_width = 1200,
		canvas_height = 1800,
		background_path = '',
		slot_count = 4,
		slots = [] as Slot[],
		overlays = [] as Overlay[]
	} = body;

	const stmt = db.prepare(`
		INSERT INTO templates (name, canvas_width, canvas_height, background_path, slot_count, slots, overlays)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`);
	const result = stmt.run(
		name,
		canvas_width,
		canvas_height,
		background_path,
		slot_count,
		JSON.stringify(slots),
		JSON.stringify(overlays)
	);

	const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(result.lastInsertRowid) as any;
	return json({
		...row,
		slots: JSON.parse(row.slots),
		overlays: JSON.parse(row.overlays)
	}, { status: 201 });
};
