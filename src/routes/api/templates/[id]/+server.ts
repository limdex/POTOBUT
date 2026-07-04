import { json } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const db = getDb();
	const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(params.id)) as any;
	if (!row) return json({ error: 'Not found' }, { status: 404 });
	return json({
		...row,
		slots: JSON.parse(row.slots || '[]'),
		overlays: JSON.parse(row.overlays || '[]')
	});
};

export const PUT: RequestHandler = async ({ params, request }) => {
	const db = getDb();
	const body = await request.json();
	const existing = db.prepare('SELECT id FROM templates WHERE id = ?').get(Number(params.id));
	if (!existing) return json({ error: 'Not found' }, { status: 404 });

	const {
		name,
		canvas_width,
		canvas_height,
		background_path,
		slot_count,
		slots,
		overlays
	} = body;

	const stmt = db.prepare(`
		UPDATE templates SET
			name = COALESCE(?, name),
			canvas_width = COALESCE(?, canvas_width),
			canvas_height = COALESCE(?, canvas_height),
			background_path = COALESCE(?, background_path),
			slot_count = COALESCE(?, slot_count),
			slots = COALESCE(?, slots),
			overlays = COALESCE(?, overlays),
			updated_at = datetime('now')
		WHERE id = ?
	`);
	stmt.run(
		name ?? null,
		canvas_width ?? null,
		canvas_height ?? null,
		background_path ?? null,
		slot_count ?? null,
		slots ? JSON.stringify(slots) : null,
		overlays ? JSON.stringify(overlays) : null,
		Number(params.id)
	);

	const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(params.id)) as any;
	return json({
		...row,
		slots: JSON.parse(row.slots),
		overlays: JSON.parse(row.overlays)
	});
};

export const DELETE: RequestHandler = async ({ params }) => {
	const db = getDb();
	const result = db.prepare('DELETE FROM templates WHERE id = ?').run(Number(params.id));
	if (result.changes === 0) return json({ error: 'Not found' }, { status: 404 });
	return json({ ok: true });
};
