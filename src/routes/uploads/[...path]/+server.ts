import type { RequestHandler } from './$types';
import fs from 'fs';
import path from 'path';

const MIME_TYPES: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.avif': 'image/avif',
	'.bmp': 'image/bmp',
	'.ico': 'image/x-icon'
};

export const GET: RequestHandler = async ({ params }) => {
	const relPath = params.path;
	if (!relPath) {
		return new Response('Not Found', { status: 404 });
	}

	const uploadsDir = path.resolve(process.cwd(), 'static', 'uploads');
	const safePath = path.normalize(relPath).replace(/^(\.\.[\/\\])+/, '');
	const filePath = path.resolve(uploadsDir, safePath);

	// Security check: ensure path is within uploadsDir
	if (!filePath.startsWith(uploadsDir)) {
		return new Response('Forbidden', { status: 403 });
	}

	if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
		return new Response('Not Found', { status: 404 });
	}

	const ext = path.extname(filePath).toLowerCase();
	const contentType = MIME_TYPES[ext] || 'application/octet-stream';
	const fileBuffer = fs.readFileSync(filePath);

	return new Response(fileBuffer, {
		status: 200,
		headers: {
			'Content-Type': contentType,
			'Cache-Control': 'public, max-age=31536000, immutable'
		}
	});
};
