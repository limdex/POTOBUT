import { error } from '@sveltejs/kit';
import sharp from 'sharp';
import { getDb } from '$lib/server/db';
import fs from 'fs';
import path from 'path';

export async function POST({ request }) {
	const { templateId, photos } = await request.json();

	const db = getDb();
	const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(Number(templateId)) as any;
	if (!row) error(400, 'Template not found');
	if (!photos?.length) error(400, 'No photos');

	const template = {
		...row,
		slots: JSON.parse(row.slots || '[]'),
		overlays: JSON.parse(row.overlays || '[]')
	};

	const bgPath = path.resolve('static', template.background_path.replace(/^\//, ''));
	const bgBuffer = fs.readFileSync(bgPath);

	const tw = template.canvas_width;
	const th = template.canvas_height;

	const pad = 0.03;
	const layers: { input: Buffer; top: number; left: number }[] = [];

	for (let i = 0; i < template.slots.length; i++) {
		const slot = template.slots[i];
		const photoData = photos[i]?.data;
		if (!photoData) continue;

		const px = Math.round(slot.x + slot.width * pad);
		const py = Math.round(slot.y + slot.height * pad);
		const pw = Math.round(slot.width * (1 - pad * 2));
		const ph = Math.round(slot.height * (1 - pad * 2));

		const photoBuffer = Buffer.from(photoData.split(',')[1], 'base64');

		const resized = await sharp(photoBuffer)
			.resize({ width: pw, height: ph, fit: 'inside', withoutEnlargement: false })
			.png()
			.toBuffer();

		const rmeta = await sharp(resized).metadata();
		const ox = Math.round(px + (pw - rmeta.width!) / 2);
		const oy = Math.round(py + (ph - rmeta.height!) / 2);

		layers.push({ input: resized, top: oy, left: ox });
	}

	for (const ov of template.overlays) {
		const ovPath = path.resolve('static', ov.src.replace(/^\//, ''));
		if (!fs.existsSync(ovPath)) continue;
		const ovBuffer = fs.readFileSync(ovPath);
		const ovResized = await sharp(ovBuffer)
			.resize({ width: Math.round(ov.width), height: Math.round(ov.height) })
			.png()
			.toBuffer();
		layers.push({ input: ovResized, top: Math.round(ov.y), left: Math.round(ov.x) });
	}

	const bg = await sharp(bgBuffer)
		.resize(tw, th, { fit: 'fill' })
		.png()
		.toBuffer();

	const result = await sharp({
		create: { width: tw, height: th, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } }
	})
		.composite([{ input: bg, top: 0, left: 0 }, ...layers])
		.png({ compressionLevel: 9 })
		.toBuffer();

	return new Response(new Uint8Array(result).buffer.slice(0), {
		headers: {
			'Content-Type': 'image/png',
			'Content-Disposition': 'attachment; filename="potobut-result.png"'
		}
	});
}
