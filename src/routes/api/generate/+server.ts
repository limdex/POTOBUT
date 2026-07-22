import { error } from '@sveltejs/kit';
import sharp from 'sharp';
import { getParsedTemplate } from '$lib/server/db';
import { paperSizes } from '$lib/data/paper-sizes';
import fs from 'fs';
import path from 'path';

export async function POST({ request }) {
	const { templateId, photos, transforms, paperSize: paperSizeKey, templateOffX = 0, templateOffY = 0 } = await request.json();

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

	const paperSize = paperSizeKey && paperSizes[paperSizeKey] ? paperSizes[paperSizeKey] : null;
	const s = paperSize ? Math.min(paperSize.width / tw, paperSize.height / th) : 1;
	const ox = paperSize ? (paperSize.width - tw * s) / 2 + templateOffX : 0;
	const oy = paperSize ? (paperSize.height - th * s) / 2 + templateOffY : 0;
	const pw = paperSize ? paperSize.width : tw;
	const ph = paperSize ? paperSize.height : th;

	for (let i = 0; i < template.slots.length; i++) {
		const slot = template.slots[i];
		const photoData = photos[i]?.data;
		if (!photoData) continue;

		const t = (transforms && transforms[i]) || { scale: 1, offsetX: 0, offsetY: 0 };
		const scale = Math.max(1, Math.min(3, t.scale || 1));

		const commaIdx = photoData.indexOf(',');
		if (commaIdx === -1) {
			console.log('[generate] Skipping photo — no comma in data, starts with:', photoData.substring(0, 80));
			continue;
		}
		const photoBuffer = Buffer.from(photoData.substring(commaIdx + 1), 'base64');

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

		const scaledLayer = paperSize
			? await sharp(extracted).resize({ width: Math.round(slot.width * s), height: Math.round(slot.height * s) }).png().toBuffer()
			: extracted;

		layers.push({
			input: scaledLayer,
			top: Math.round(slot.y * s + oy),
			left: Math.round(slot.x * s + ox),
		});
	}

	for (const ov of template.overlays) {
		const ovPath = path.resolve('static', ov.src.replace(/^\//, ''));
		if (!fs.existsSync(ovPath)) continue;
		const ovBuffer = fs.readFileSync(ovPath);
		const ovResized = await sharp(ovBuffer)
			.resize({ width: Math.round(ov.width * s), height: Math.round(ov.height * s) })
			.png()
			.toBuffer();
		layers.push({
			input: ovResized,
			top: Math.round(ov.y * s + oy),
			left: Math.round(ov.x * s + ox),
		});
	}

	const bg = paperSize
		? await sharp(bgBuffer).resize({ width: Math.round(tw * s), height: Math.round(th * s), fit: 'fill' }).png().toBuffer()
		: await sharp(bgBuffer).resize(tw, th, { fit: 'fill' }).png().toBuffer();

	const result = await sharp({
		create: { width: pw, height: ph, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
	})
		.composite([{ input: bg, top: Math.round(oy), left: Math.round(ox) }, ...layers])
		.png({ compressionLevel: 3 })
		.toBuffer();

	return new Response(new Uint8Array(result).buffer.slice(0), {
		headers: {
			'Content-Type': 'image/png',
			'Content-Disposition': 'attachment; filename="potobut-result.png"'
		}
	});
}
