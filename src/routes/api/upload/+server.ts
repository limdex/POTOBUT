import { json } from '@sveltejs/kit';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const formData = await request.formData();
	const file = formData.get('file') as File | null;
	if (!file) return json({ error: 'No file' }, { status: 400 });

	const ext = file.name.split('.').pop() || 'png';
	const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
	const dir = join(process.cwd(), 'static', 'uploads');
	mkdirSync(dir, { recursive: true });
	const buffer = Buffer.from(await file.arrayBuffer());
	writeFileSync(join(dir, filename), buffer);

	return json({ path: `/uploads/${filename}` });
};
