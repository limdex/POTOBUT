<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { shootState } from '$lib/stores/shoot.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const template = data.template;
	const slots = $derived(template.slots || []);
	const overlays = $derived(template.overlays || []);

	interface Transform { scale: number; offsetX: number; offsetY: number }

	let transforms = $state<Transform[]>(slots.map(() => ({ scale: 1, offsetX: 0, offsetY: 0 })));
	let selectedSlot = $state<number | null>(null);
	let bgImg = $state<HTMLImageElement | null>(null);
	let photoImgs = $state<(HTMLImageElement | null)[]>([]);
	let overlayImgs = $state<HTMLImageElement[]>([]);
	let canvasEl = $state<HTMLCanvasElement | undefined>(undefined);
	let ready = $state(false);
	let loadError = $state(false);

	let dragging = $state(false);
	let dragStartX = 0;
	let dragStartY = 0;
	let dragStartOffX = 0;
	let dragStartOffY = 0;
	let drawPending = false;

	let mencetak = $state(false);
	let printerConnected = $state(false);

	let toast = $state<{ message: string; type: 'success' | 'error' } | null>(null);
	let toastTimer: ReturnType<typeof setTimeout> | undefined;

	function showToast(message: string, type: 'success' | 'error') {
		if (toastTimer) clearTimeout(toastTimer);
		toast = { message, type };
		toastTimer = setTimeout(() => toast = null, type === 'success' ? 2500 : 4000);
	}

	function loadImage(src: string): Promise<HTMLImageElement> {
		return new Promise((resolve, reject) => {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			img.onload = () => resolve(img);
			img.onerror = () => reject(new Error('Gagal muat gambar'));
			img.src = src;
		});
	}

	function drawImageCover(
		ctx: CanvasRenderingContext2D,
		img: HTMLImageElement,
		dx: number, dy: number, dw: number, dh: number
	) {
		const scale = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
		const sw = dw / scale;
		const sh = dh / scale;
		const sx = (img.naturalWidth - sw) / 2;
		const sy = (img.naturalHeight - sh) / 2;
		ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
	}

	function scheduleDraw() {
		if (drawPending) return;
		drawPending = true;
		requestAnimationFrame(() => {
			drawPending = false;
			drawCanvas();
		});
	}

	function drawCanvas() {
		if (!canvasEl) return;
		const ctx = canvasEl.getContext('2d', { willReadFrequently: false })!;
		const cw = template.canvas_width;
		const ch = template.canvas_height;
		canvasEl.width = cw;
		canvasEl.height = ch;

		if (bgImg) {
			drawImageCover(ctx, bgImg, 0, 0, cw, ch);
		} else {
			ctx.fillStyle = '#1f2937';
			ctx.fillRect(0, 0, cw, ch);
		}

		for (let i = 0; i < slots.length; i++) {
			const slot = slots[i];
			const photo = photoImgs[i];
			if (!photo) continue;

			const t = transforms[i];
			const scale = t.scale;
			const drawW = slot.width * scale;
			const drawH = slot.height * scale;

			ctx.save();
			ctx.beginPath();
			ctx.rect(slot.x, slot.y, slot.width, slot.height);
			ctx.clip();

			const cx = slot.x + slot.width / 2;
			const cy = slot.y + slot.height / 2;
			const dx = cx - drawW / 2 - t.offsetX;
			const dy = cy - drawH / 2 - t.offsetY;

			drawImageCover(ctx, photo, dx, dy, drawW, drawH);
			ctx.restore();
		}

		for (let i = 0; i < overlays.length; i++) {
			const ov = overlays[i];
			const img = overlayImgs[i];
			if (!img) continue;

			ctx.save();
			if (ov.rotation) {
				const cx = ov.x + ov.width / 2;
				const cy = ov.y + ov.height / 2;
				ctx.translate(cx, cy);
				ctx.rotate((ov.rotation * Math.PI) / 180);
				ctx.translate(-cx, -cy);
			}
			drawImageCover(ctx, img, ov.x, ov.y, ov.width, ov.height);
			ctx.restore();
		}

		if (selectedSlot !== null) {
			const s = slots[selectedSlot];
			ctx.save();
			ctx.strokeStyle = '#4f46e5';
			ctx.lineWidth = 3;
			ctx.strokeRect(s.x, s.y, s.width, s.height);
			ctx.restore();
		}
	}

	function canvasPos(e: PointerEvent | MouseEvent): { x: number; y: number } {
		const rect = canvasEl!.getBoundingClientRect();
		const sx = canvasEl!.width / rect.width;
		const sy = canvasEl!.height / rect.height;
		return {
			x: (e.clientX - rect.left) * sx,
			y: (e.clientY - rect.top) * sy
		};
	}

	function slotAtPos(pos: { x: number; y: number }): number | null {
		for (let i = 0; i < slots.length; i++) {
			const s = slots[i];
			if (pos.x >= s.x && pos.x <= s.x + s.width && pos.y >= s.y && pos.y <= s.y + s.height) {
				return i;
			}
		}
		return null;
	}

	function handlePointerDown(e: PointerEvent) {
		const pos = canvasPos(e);
		const idx = slotAtPos(pos);
		if (idx === null) {
			selectedSlot = null;
			scheduleDraw();
			return;
		}
		selectedSlot = idx;
		const t = transforms[idx];
		dragging = true;
		dragStartX = pos.x;
		dragStartY = pos.y;
		dragStartOffX = t.offsetX;
		dragStartOffY = t.offsetY;
		canvasEl!.setPointerCapture(e.pointerId);
		scheduleDraw();
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragging || selectedSlot === null) return;
		const pos = canvasPos(e);
		const dx = pos.x - dragStartX;
		const dy = pos.y - dragStartY;
		const t = transforms[selectedSlot];
		const maxX = (slots[selectedSlot].width * t.scale - slots[selectedSlot].width) / 2;
		const maxY = (slots[selectedSlot].height * t.scale - slots[selectedSlot].height) / 2;
		t.offsetX = Math.max(-maxX, Math.min(maxX, dragStartOffX + dx));
		t.offsetY = Math.max(-maxY, Math.min(maxY, dragStartOffY + dy));
		scheduleDraw();
	}

	function handlePointerUp(_e: PointerEvent) {
		dragging = false;
	}

	function handleDblClick(e: MouseEvent) {
		const pos = canvasPos(e);
		const idx = slotAtPos(pos);
		if (idx !== null) {
			transforms[idx] = { scale: 1, offsetX: 0, offsetY: 0 };
			selectedSlot = idx;
			scheduleDraw();
		}
	}

	function handleWheel(e: WheelEvent) {
		if (selectedSlot === null) return;
		e.preventDefault();
		const delta = e.deltaY > 0 ? -0.1 : 0.1;
		setZoom(selectedSlot, transforms[selectedSlot].scale + delta);
	}

	function setZoom(idx: number, value: number) {
		const newScale = Math.max(1, Math.min(3, Math.round(value * 10) / 10));
		const t = transforms[idx];
		t.scale = newScale;
		const maxX = (slots[idx].width * newScale - slots[idx].width) / 2;
		const maxY = (slots[idx].height * newScale - slots[idx].height) / 2;
		t.offsetX = Math.max(-maxX, Math.min(maxX, t.offsetX));
		t.offsetY = Math.max(-maxY, Math.min(maxY, t.offsetY));
		scheduleDraw();
	}

	function handleZoomInput(e: Event) {
		if (selectedSlot === null) return;
		setZoom(selectedSlot, parseFloat((e.target as HTMLInputElement).value));
	}

	async function cetak() {
		if (!shootState.capturedPhotos.length) return;
		mencetak = true;
		try {
			const res = await fetch('/api/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					templateId: template.id,
					photos: shootState.capturedPhotos.map(p => ({ data: p.data })),
					transforms
				})
			});
			if (!res.ok) throw new Error('Gagal generate');
			const blob = await res.blob();
			const dataUrl = await new Promise<string>((resolve) => {
				const reader = new FileReader();
				reader.onload = () => resolve(reader.result as string);
				reader.readAsDataURL(blob);
			});

			if (printerConnected) {
				const printRes = await fetch('/api/print', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ image: dataUrl })
				});
				const result = await printRes.json();
				if (!result.ok) {
					showToast('Gagal mencetak: ' + (result.error || 'Unknown'), 'error');
				} else {
					showToast('Tercetak!', 'success');
				}
			} else {
				const a = document.createElement('a');
				a.href = dataUrl;
				a.download = 'potobut-result.png';
				a.click();
				showToast('Tersimpan!', 'success');
			}
		} catch (e) {
			showToast('Gagal: ' + (e as Error).message, 'error');
		} finally {
			mencetak = false;
		}
	}

	onMount(async () => {
		try {
			if (template.background_path) {
				bgImg = await loadImage(template.background_path).catch(() => null);
			}
			const loadedPhotos = await Promise.all(
				shootState.capturedPhotos.map(p => loadImage(p.data).catch(() => null))
			);
			photoImgs = loadedPhotos;
			const loadedOvs = await Promise.all(
				overlays.map((ov: any) => loadImage(ov.src).catch(() => null))
			);
			overlayImgs = loadedOvs;
			ready = true;
		} catch {
			loadError = true;
			ready = true;
		}

		fetch('/api/printer').then(r => r.json()).then(s => printerConnected = s.connected);
	});

	$effect(() => {
		if (ready) drawCanvas();
	});
</script>

<svelte:head>
	<title>Hasil Foto — potobut</title>
</svelte:head>

<div class="page">
	<div class="toolbar">
		<button class="btn outline" onclick={() => { shootState.reset(); goto('/templates'); }}>Ulangi</button>
		<button class="btn" onclick={cetak} disabled={mencetak || !ready}>{mencetak ? 'Memproses...' : 'Cetak'}</button>
	</div>

	{#if !ready}
		<div class="loading">Memproses...</div>
	{:else if loadError}
		<div class="loading error">Gagal memuat foto</div>
	{:else}
		<div class="photo-wrap">
			<canvas
				bind:this={canvasEl}
				onpointerdown={handlePointerDown}
				onpointermove={handlePointerMove}
				onpointerup={handlePointerUp}
				onpointerleave={handlePointerUp}
				ondblclick={handleDblClick}
				onwheel={handleWheel}
			></canvas>
		</div>

		{#if selectedSlot !== null}
			<div class="zoom-bar">
				<div class="zoom-info">
					<span class="zoom-label">Zoom Slot {selectedSlot + 1}</span>
					<span class="zoom-value">{transforms[selectedSlot].scale.toFixed(1)}×</span>
				</div>
				<input
					type="range"
					min="1"
					max="3"
					step="0.1"
					value={transforms[selectedSlot].scale}
					oninput={handleZoomInput}
					class="zoom-slider"
				/>
				<button class="btn-sm" onclick={() => { setZoom(selectedSlot!, 1); }}>Reset</button>
			</div>
		{/if}

		{#if selectedSlot === null && ready}
			<div class="hint">Klik foto untuk atur posisi</div>
		{/if}

		{#if toast}
			<div class="toast {toast.type}">{toast.message}</div>
		{/if}
	{/if}
</div>

<style>
	.page {
		height: 100dvh;
		display: flex;
		flex-direction: column;
		background: #000;
		box-sizing: border-box;
		position: relative;
		overflow: hidden;
	}
	.toolbar {
		position: absolute;
		top: 1rem;
		right: 1rem;
		display: flex;
		gap: 0.5rem;
		z-index: 10;
	}
	.photo-wrap {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 0;
		padding: 1rem;
	}
	canvas {
		max-width: 100%;
		max-height: 100%;
		width: auto;
		height: auto;
		border-radius: 6px;
		cursor: pointer;
	}
	.zoom-bar {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		background: rgba(0, 0, 0, 0.95);
		padding: 0.75rem 1.5rem;
		display: flex;
		align-items: center;
		gap: 1rem;
		z-index: 10;
		border-top: 1px solid rgba(255,255,255,0.08);
	}
	.zoom-info {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 90px;
	}
	.zoom-label {
		font-size: 0.75rem;
		color: #6b7280;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.zoom-value {
		font-size: 1.1rem;
		color: #fff;
		font-weight: 700;
	}
	.zoom-slider {
		flex: 1;
		-webkit-appearance: none;
		height: 6px;
		border-radius: 3px;
		background: #334155;
		outline: none;
	}
	.zoom-slider::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 20px;
		height: 20px;
		border-radius: 50%;
		background: #4f46e5;
		cursor: pointer;
		border: 2px solid #fff;
	}
	.hint {
		position: absolute;
		bottom: 1rem;
		left: 50%;
		transform: translateX(-50%);
		font-size: 0.8rem;
		color: #6b7280;
		pointer-events: none;
	}
	.btn {
		padding: 0.55rem 1.4rem;
		font-size: 0.85rem;
		font-weight: 600;
		border: none;
		border-radius: 8px;
		background: #4f46e5;
		color: #fff;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.btn:hover { opacity: 0.9; }
	.btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.btn.outline {
		background: transparent;
		border: 2px solid #4f46e5;
		color: #4f46e5;
	}
	.btn.outline:hover {
		background: #4f46e5;
		color: #fff;
	}
	.btn-sm {
		padding: 0.4rem 1rem;
		font-size: 0.8rem;
		font-weight: 600;
		border: 1px solid #4b5563;
		border-radius: 6px;
		background: transparent;
		color: #9ca3af;
		cursor: pointer;
		transition: all 0.15s;
	}
	.btn-sm:hover {
		border-color: #4f46e5;
		color: #4f46e5;
	}
	.loading {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		color: #6b7280;
		font-size: 1rem;
	}
	.loading.error {
		color: #ef4444;
	}
	.toast {
		position: absolute;
		top: 1rem;
		left: 50%;
		transform: translateX(-50%);
		padding: 0.7rem 1.5rem;
		border-radius: 10px;
		font-size: 0.9rem;
		font-weight: 600;
		z-index: 20;
		animation: toast-in 0.2s ease-out;
	}
	.toast.success {
		background: #16a34a;
		color: #fff;
	}
	.toast.error {
		background: #dc2626;
		color: #fff;
	}
	@keyframes toast-in {
		from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
		to { opacity: 1; transform: translateX(-50%) translateY(0); }
	}
</style>
