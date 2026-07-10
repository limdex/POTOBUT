import { error } from '@sveltejs/kit';
import sharp from 'sharp';
import { getParsedTemplate } from '$lib/server/db';
import fs from 'fs';
import path from 'path';

export async function POST({ request }) {
	const { templateId, photos, transforms } = await request.json();

	const template = getParsedTemplate(Number(templateId));
	if (!template) error(400, 'Template not found');
	if (!photos?.length) error(400, 'No photos');

	const tw = template.canvas_width;
	const th = template.canvas_height;

	let bgBuffer: Buffer;
	if (template.background_path) {
		const bgPath = path.resolve('static', template.background_path.replace(/^\//, ''));
		if (fs.existsSync(bgPath)) {
			bgBuffer = fs.readFileSync(bgPath);
		} else {
			bgBuffer = await sharp({ create: { width: tw, height: th, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
		}
	} else {
		bgBuffer = await sharp({ create: { width: tw, height: th, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
	}

	const layers: { input: Buffer; top: number; left: number }[] = [];

	for (let i = 0; i < template.slots.length; i++) {
		const slot = template.slots[i];
		const photoData = photos[i]?.data;
		if (!photoData) continue;

		const t = (transforms && transforms[i]) || { scale: 1, offsetX: 0, offsetY: 0 };
		const scale = Math.max(1, Math.min(3, t.scale || 1));

		const photoBuffer = Buffer.from(photoData.split(',')[1], 'base64');

		const scaledW = Math.round(slot.width * scale);
		const scaledH = Math.round(slot.height * scale);

		const maxOffX = (scaledW - slot.width) / 2;
		const maxOffY = (scaledH - slot.height) / 2;
		const offX = Math.max(-maxOffX, Math.min(maxOffX, t.offsetX || 0));
		const offY = Math.max(-maxOffY, Math.min(maxOffY, t.offsetY || 0));

		const rawLeft = Math.round(scaledW / 2 - slot.width / 2 - offX);
		const rawTop = Math.round(scaledH / 2 - slot.height / 2 - offY);
		const left = Math.max(0, Math.min(rawLeft, scaledW - slot.width));
		const top = Math.max(0, Math.min(rawTop, scaledH - slot.height));

		const extracted = await sharp(photoBuffer)
			.resize({ width: scaledW, height: scaledH, fit: 'cover' })
			.extract({ left, top, width: Math.round(slot.width), height: Math.round(slot.height) })
			.png()
			.toBuffer();

		layers.push({ input: extracted, top: Math.round(slot.y), left: Math.round(slot.x) });
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
		.png({ compressionLevel: 3 })
		.toBuffer();

	return new Response(new Uint8Array(result).buffer.slice(0), {
		headers: {
			'Content-Type': 'image/png',
			'Content-Disposition': 'attachment; filename="potobut-result.png"'
		}
	});
}
