import type { RequestHandler } from './$types';
import { subscribeFrames, getCameraStatus } from '$lib/server/camera';
import { Buffer } from 'buffer';

export const GET: RequestHandler = () => {
	const status = getCameraStatus();
	if (!status.connected) {
		return new Response('Camera not connected', { status: 503 });
	}

	const encoder = new TextEncoder();
	let closed = false;
	let unsub: (() => void) | null = null;

	const stream = new ReadableStream({
		start(controller) {
			unsub = subscribeFrames((buf: Buffer) => {
				if (closed || buf.length < 500) return;
				try {
					controller.enqueue(encoder.encode(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${buf.length}\r\n\r\n`));
					controller.enqueue(new Uint8Array(buf));
					controller.enqueue(encoder.encode('\r\n'));
				} catch {
					cleanup();
				}
			});
		},
		cancel() {
			cleanup();
		}
	});

	function cleanup() {
		if (closed) return;
		closed = true;
		if (unsub) { unsub(); unsub = null; }
	}

	return new Response(stream, {
		headers: {
			'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
			'Cache-Control': 'no-cache, no-store, must-revalidate',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no'
		}
	});
};
