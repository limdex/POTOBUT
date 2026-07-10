<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { SLOT_WIDTH, SLOT_HEIGHT } from '$lib/data/admin-types';

	import type { Slot, Overlay } from '$lib/data/admin-types';
	let { data }: { data: { template: any | null } } = $props();

	let id = $state(data.template?.id ?? 0);
	let name = $state(data.template?.name ?? '');
	let backgroundPath = $state(data.template?.background_path ?? '');
	let canvasWidth = $state(data.template?.canvas_width ?? 0);
	let canvasHeight = $state(data.template?.canvas_height ?? 0);
	let slots = $state<Slot[]>(data.template?.slots ?? []);
	let overlays = $state<Overlay[]>(data.template?.overlays ?? []);
	let selectedId = $state<string | null>(null);
	let saving = $state(false);
	let dragState: { type: 'move' | 'resize' | 'canvas-resize'; elementId?: string; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number; handle?: string } | null = null;
	let canvasEl = $state<HTMLDivElement | undefined>(undefined);
	let canvasScale = $state(1);
	let confirmDelete = $state<'slots' | 'overlays' | null>(null);

	let nextOverlayId = $state(overlays.length + 1);

	const bgImg = $derived.by(() => {
		if (!backgroundPath || !browser) return null;
		const img = new Image();
		img.src = backgroundPath;
		return img;
	});

	function getCanvasScale() {
		if (!canvasEl) return 1;
		const rect = canvasEl.getBoundingClientRect();
		const cw = rect.width - 40;
		const ch = rect.height - 40;
		if (!canvasWidth || !canvasHeight) return 1;
		return Math.min(cw / canvasWidth, ch / canvasHeight, 1);
	}

	function toCanvasCoords(clientX: number, clientY: number): { x: number; y: number } | null {
		if (!canvasEl || !canvasWidth || !canvasHeight) return null;
		const rect = canvasEl.getBoundingClientRect();
		const pad = 20;
		const cw = rect.width - pad * 2;
		const ch = rect.height - pad * 2;
		const scale = Math.min(cw / canvasWidth, ch / canvasHeight, 1);
		const drawW = canvasWidth * scale;
		const drawH = canvasHeight * scale;
		const ox = pad + (cw - drawW) / 2;
		const oy = pad + (ch - drawH) / 2;
		return {
			x: (clientX - rect.left - ox) / scale,
			y: (clientY - rect.top - oy) / scale
		};
	}

	async function uploadBg() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch('/api/upload', { method: 'POST', body: fd });
			const data = await res.json();
			backgroundPath = data.path;

			const img = new Image();
			img.onload = () => {
				canvasWidth = img.naturalWidth;
				canvasHeight = img.naturalHeight;
			};
			img.src = data.path;
		};
		input.click();
	}

	async function uploadOverlay() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = 'image/*';
		input.onchange = async () => {
			const file = input.files?.[0];
			if (!file) return;
			const fd = new FormData();
			fd.append('file', file);
			const res = await fetch('/api/upload', { method: 'POST', body: fd });
			const data = await res.json();

			const img = new Image();
			img.onload = () => {
				const w = Math.min(img.naturalWidth, canvasWidth * 0.3);
				const h = Math.min(img.naturalHeight, canvasHeight * 0.3);
				const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight, 1);
				const overlay: Overlay = {
					id: 'ov-' + nextOverlayId++,
					src: data.path,
					x: (canvasWidth - img.naturalWidth * scale) / 2,
					y: (canvasHeight - img.naturalHeight * scale) / 2,
					width: Math.round(img.naturalWidth * scale),
					height: Math.round(img.naturalHeight * scale),
					rotation: 0
				};
				overlays = [...overlays, overlay];
				selectedId = overlay.id;
			};
			img.src = data.path;
		};
		input.click();
	}

	function addSlot() {
		if (slots.length >= 8) return;
		const slot: Slot = {
			x: 50 + slots.length * 30,
			y: 50 + slots.length * 30,
			width: SLOT_WIDTH,
			height: SLOT_HEIGHT
		};
		slots = [...slots, slot];
		selectedId = 'slot-' + slots.length;
	}

	function removeSelected() {
		if (!selectedId) return;
		if (selectedId.startsWith('slot-')) {
			const idx = parseInt(selectedId.replace('slot-', '')) - 1;
			if (idx >= 0 && idx < slots.length) {
				slots = slots.filter((_, i) => i !== idx);
				selectedId = null;
			}
		} else {
			overlays = overlays.filter(o => o.id !== selectedId);
			selectedId = null;
		}
	}

	function handlePointerDown(e: PointerEvent, elementType: 'slot' | 'overlay', id: string) {
		e.stopPropagation();
		selectedId = id;
		const coords = toCanvasCoords(e.clientX, e.clientY);
		if (!coords) return;

		let target: { x: number; y: number; width: number; height: number } | undefined;
		if (elementType === 'slot') {
			const idx = parseInt(id.replace('slot-', '')) - 1;
			target = slots[idx];
		} else {
			target = overlays.find(o => o.id === id);
		}
		if (!target) return;

		dragState = {
			type: 'move',
			elementId: id,
			startX: coords.x,
			startY: coords.y,
			origX: target.x,
			origY: target.y,
			origW: target.width,
			origH: target.height
		};
	}

	function handleResizePointerDown(e: PointerEvent, elType: 'slot' | 'overlay', id: string, handle: string) {
		e.stopPropagation();
		e.preventDefault();
		selectedId = id;
		const coords = toCanvasCoords(e.clientX, e.clientY);
		if (!coords) return;

		let target: { x: number; y: number; width: number; height: number } | undefined;
		if (elType === 'slot') {
			const idx = parseInt(id.replace('slot-', '')) - 1;
			target = slots[idx];
		} else {
			target = overlays.find(o => o.id === id);
		}
		if (!target) return;

		dragState = {
			type: 'resize',
			elementId: id,
			handle,
			startX: coords.x,
			startY: coords.y,
			origX: target.x,
			origY: target.y,
			origW: target.width,
			origH: target.height
		};
	}

	function handleCanvasResizePointerDown(e: PointerEvent, handle: string) {
		e.stopPropagation();
		e.preventDefault();
		const coords = toCanvasCoords(e.clientX, e.clientY);
		if (!coords) return;

		dragState = {
			type: 'canvas-resize',
			handle,
			startX: coords.x,
			startY: coords.y,
			origX: 0,
			origY: 0,
			origW: canvasWidth,
			origH: canvasHeight
		};
	}

	function handlePointerMove(e: PointerEvent) {
		if (!dragState) return;
		const coords = toCanvasCoords(e.clientX, e.clientY);
		if (!coords) return;
		const dx = coords.x - dragState.startX;
		const dy = coords.y - dragState.startY;

		const ds = dragState;
		if (ds.type === 'move') {
			const nx = ds.origX + dx;
			const ny = ds.origY + dy;

			if (ds.elementId.startsWith('slot-')) {
				const idx = parseInt(ds.elementId.replace('slot-', '')) - 1;
				if (idx >= 0 && idx < slots.length) {
					slots = slots.map((s, i) => i === idx ? { ...s, x: nx, y: ny } : s);
				}
			} else {
				overlays = overlays.map(o =>
					o.id === ds.elementId ? { ...o, x: nx, y: ny } : o
				);
			}
		} else if (ds.type === 'resize') {
			const handle = ds.handle!;
			let nx = ds.origX, ny = ds.origY, nw = ds.origW, nh = ds.origH;
			if (handle.includes('e')) nw = Math.max(50, ds.origW + dx);
			if (handle.includes('w')) { nw = Math.max(50, ds.origW - dx); nx = ds.origX + dx; }
			if (handle.includes('s')) nh = Math.max(50, ds.origH + dy);
			if (handle.includes('n')) { nh = Math.max(50, ds.origH - dy); ny = ds.origY + dy; }

			if (ds.elementId!.startsWith('slot-')) {
				const idx = parseInt(ds.elementId!.replace('slot-', '')) - 1;
				if (idx >= 0 && idx < slots.length) {
					slots = slots.map((s, i) => i === idx ? { ...s, x: nx, y: ny, width: nw, height: nh } : s);
				}
			} else {
				overlays = overlays.map(o =>
					o.id === ds.elementId ? { ...o, x: nx, y: ny, width: nw, height: nh } : o
				);
			}
		} else if (ds.type === 'canvas-resize') {
			const handle = ds.handle!;
			let nw = ds.origW, nh = ds.origH;
			if (handle.includes('e')) nw = Math.max(50, ds.origW + dx);
			if (handle.includes('w')) nw = Math.max(50, ds.origW - dx);
			if (handle.includes('s')) nh = Math.max(50, ds.origH + dy);
			if (handle.includes('n')) nh = Math.max(50, ds.origH - dy);
			canvasWidth = Math.round(nw);
			canvasHeight = Math.round(nh);
		}
	}

	function handlePointerUp() {
		dragState = null;
	}

	function handleCanvasClick(e: MouseEvent) {
		if (dragState) return;
		const target = e.target as HTMLElement;
		if (target === canvasEl || target.closest('.canvas-inner')) {
			if (!target.closest('.slot-el') && !target.closest('.overlay-el')) {
				selectedId = null;
			}
		}
	}

	function removeAllSlots() {
		slots = [];
		selectedId = null;
		confirmDelete = null;
	}

	function removeAllOverlays() {
		overlays = [];
		selectedId = null;
		confirmDelete = null;
	}

	function requestRemoveSlots() {
		confirmDelete = 'slots';
	}

	function requestRemoveOverlays() {
		confirmDelete = 'overlays';
	}

	async function save() {
		if (!name.trim()) name = 'Template Baru';
		saving = true;
		const body = {
			name,
			canvas_width: canvasWidth,
			canvas_height: canvasHeight,
			background_path: backgroundPath,
			slot_count: slots.length,
			slots,
			overlays
		};

		let res;
		if (id > 0) {
			res = await fetch(`/api/templates/${id}`, {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
		} else {
			res = await fetch('/api/templates', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
		}
		if (res.ok) {
			const saved = await res.json();
			id = saved.id;
		}
		saving = false;
		goto('/admin');
	}

	function getSelectedSlotIndex(): number {
		if (!selectedId || !selectedId.startsWith('slot-')) return -1;
		return parseInt(selectedId.replace('slot-', '')) - 1;
	}

	function getSelectedOverlay(): Overlay | undefined {
		if (!selectedId || selectedId.startsWith('slot-')) return undefined;
		return overlays.find(o => o.id === selectedId);
	}

	function updateSlotPos(idx: number, field: 'x' | 'y' | 'width' | 'height', val: number) {
		slots = slots.map((s, i) => i === idx ? { ...s, [field]: val } : s);
	}

	function updateOverlay(field: string, val: number) {
		const sel = getSelectedOverlay();
		if (!sel) return;
		overlays = overlays.map(o =>
			o.id === sel.id ? { ...o, [field]: val } as Overlay : o
		);
	}
</script>

<svelte:head>
	<title>Editor Template — potobut</title>
</svelte:head>

<div class="editor-page">
	<div class="topbar">
		<button class="back-btn" onclick={() => goto('/admin')}>← Kembali</button>
		<input class="name-input" type="text" bind:value={name} placeholder="Nama template" />
		<button class="save-btn" onclick={save} disabled={saving || !canvasWidth || !backgroundPath}>
			{saving ? 'Menyimpan...' : 'Simpan'}
		</button>
	</div>

	<div class="editor-body">
		<div class="toolbar">
			<button class="tool-btn" onclick={uploadBg} title="Upload Background">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5-5 5"/></svg>
				BG
			</button>
			<button class="tool-btn" onclick={addSlot} disabled={slots.length >= 8} title="Tambah Slot Foto">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5-5 5"/></svg>
				+Slot ({slots.length}/8)
			</button>
			<button class="tool-btn" onclick={uploadOverlay} title="Tambah Overlay">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14"/><path d="m19 12-7 7-7-7"/></svg>
				+Overlay
			</button>
			{#if selectedId}
				<button class="tool-btn danger" onclick={removeSelected} title="Hapus">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
					Hapus
				</button>
			{/if}
		</div>

		<div
			class="canvas-container"
			bind:this={canvasEl}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
			onpointerleave={handlePointerUp}
			onclick={handleCanvasClick}
		>
			{#if !backgroundPath}
				<div class="canvas-empty">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5-5 5"/></svg>
					<p>Upload background untuk memulai</p>
				</div>
			{:else}
				{@const scale = getCanvasScale()}
				<div class="canvas-resize-wrap" style="width: {canvasWidth * scale}px; height: {canvasHeight * scale}px;">
					<div
						class="canvas-inner"
						style="width: {canvasWidth}px; height: {canvasHeight}px; transform: scale({scale}); transform-origin: top left;"
					>
					<img src={backgroundPath} alt="BG" class="bg-img" draggable="false" />

					{#each slots as slot, i}
						{@const sid = 'slot-' + (i + 1)}
						<div
							class="slot-el"
							class:selected={selectedId === sid}
							style="left: {slot.x}px; top: {slot.y}px; width: {slot.width}px; height: {slot.height}px;"
							onpointerdown={(e) => handlePointerDown(e, 'slot', sid)}
						>
							<div class="slot-placeholder">
								<svg width="40%" height="40%" viewBox="0 0 100 100" fill="rgba(255,255,255,0.2)">
									<circle cx="50" cy="35" r="18" />
									<ellipse cx="50" cy="75" rx="30" ry="25" />
								</svg>
							</div>
							<div class="slot-label">{i + 1}</div>
							{#if selectedId === sid}
								{#each ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'] as handle}
									<div
										class="resize-handle {handle}"
										onpointerdown={(e) => handleResizePointerDown(e, 'slot', sid, handle)}
									></div>
								{/each}
							{/if}
						</div>
					{/each}

					{#each overlays as ov}
						<div
							class="overlay-el"
							class:selected={selectedId === ov.id}
							style="left: {ov.x}px; top: {ov.y}px; width: {ov.width}px; height: {ov.height}px; transform: rotate({ov.rotation}deg);"
							onpointerdown={(e) => handlePointerDown(e, 'overlay', ov.id)}
						>
							<img src={ov.src} alt="" draggable="false" />
							{#if selectedId === ov.id}
								{#each ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'] as handle}
									<div
										class="resize-handle {handle}"
										onpointerdown={(e) => handleResizePointerDown(e, 'overlay', ov.id, handle)}
									></div>
								{/each}
							{/if}
						</div>
					{/each}
				</div>
				{#if !selectedId}
					{#each ['nw', 'ne', 'sw', 'se'] as handle}
						<div
							class="canvas-resize-handle {handle}"
							onpointerdown={(e) => handleCanvasResizePointerDown(e, handle)}
						></div>
					{/each}
				{/if}
				</div>
			{/if}
		</div>

		<div class="sidebar">
			{#if selectedId}
				{@const isSlot = selectedId.startsWith('slot-')}
				{@const idx = getSelectedSlotIndex()}
				{@const ov = getSelectedOverlay()}
				<div class="sidebar-section">
					<h3>{isSlot ? 'Slot ' + (idx + 1) : 'Overlay'}</h3>
					{#if isSlot && idx >= 0}
						{@const s = slots[idx]}
						<label>X <input type="number" value={Math.round(s.x)} oninput={(e) => updateSlotPos(idx, 'x', parseInt((e.target as HTMLInputElement).value) || 0)} /></label>
						<label>Y <input type="number" value={Math.round(s.y)} oninput={(e) => updateSlotPos(idx, 'y', parseInt((e.target as HTMLInputElement).value) || 0)} /></label>
						<label>W <input type="number" value={Math.round(s.width)} oninput={(e) => updateSlotPos(idx, 'width', parseInt((e.target as HTMLInputElement).value) || 50)} /></label>
						<label>H <input type="number" value={Math.round(s.height)} oninput={(e) => updateSlotPos(idx, 'height', parseInt((e.target as HTMLInputElement).value) || 50)} /></label>
					{:else if ov}
						<label>X <input type="number" value={Math.round(ov.x)} oninput={(e) => updateOverlay('x', parseInt((e.target as HTMLInputElement).value) || 0)} /></label>
						<label>Y <input type="number" value={Math.round(ov.y)} oninput={(e) => updateOverlay('y', parseInt((e.target as HTMLInputElement).value) || 0)} /></label>
						<label>W <input type="number" value={Math.round(ov.width)} oninput={(e) => updateOverlay('width', parseInt((e.target as HTMLInputElement).value) || 50)} /></label>
						<label>H <input type="number" value={Math.round(ov.height)} oninput={(e) => updateOverlay('height', parseInt((e.target as HTMLInputElement).value) || 50)} /></label>
						<label>Rot <input type="number" value={ov.rotation} oninput={(e) => updateOverlay('rotation', parseFloat((e.target as HTMLInputElement).value) || 0)} /></label>
					{/if}
				</div>
			{:else}
				{#if canvasWidth > 0}
					<div class="sidebar-section">
						<h3>Canvas</h3>
						<label>W <input type="number" bind:value={canvasWidth} min="1" /></label>
						<label>H <input type="number" bind:value={canvasHeight} min="1" /></label>
					</div>
				{/if}
				<div class="sidebar-empty">Klik slot atau overlay untuk mengatur posisi</div>
				{#if slots.length > 0}
					<div class="sidebar-row">
						<span class="sidebar-count">{slots.length} Slot</span>
						<button class="sidebar-link danger" onclick={requestRemoveSlots}>Hapus semua</button>
					</div>
				{/if}
				{#if overlays.length > 0}
					<div class="sidebar-row">
						<span class="sidebar-count">{overlays.length} Overlay</span>
						<button class="sidebar-link danger" onclick={requestRemoveOverlays}>Hapus semua</button>
					</div>
				{/if}
			{/if}

			{#if confirmDelete}
				<div class="confirm-pop">
					<span>Hapus semua {confirmDelete === 'slots' ? 'slot' : 'overlay'}?</span>
					<button class="confirm-btn ya" onclick={confirmDelete === 'slots' ? removeAllSlots : removeAllOverlays}>Ya</button>
					<button class="confirm-btn" onclick={() => confirmDelete = null}>Batal</button>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.editor-page {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		background: #f8f9fa;
	}
	.topbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.6rem 1rem;
		background: #fff;
		border-bottom: 1px solid #e5e7eb;
	}
	.back-btn {
		padding: 0.4rem 0.8rem;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		background: #fff;
		font-size: 0.85rem;
		cursor: pointer;
	}
	.back-btn:hover { background: #f3f4f6; }
	.name-input {
		flex: 1;
		padding: 0.45rem 0.7rem;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 600;
		outline: none;
	}
	.name-input:focus { border-color: #4f46e5; }
	.save-btn {
		padding: 0.5rem 1.5rem;
		border: none;
		border-radius: 8px;
		background: #4f46e5;
		color: #fff;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
	}
	.save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.save-btn:not(:disabled):hover { opacity: 0.85; }
	.editor-body {
		flex: 1;
		display: flex;
		overflow: hidden;
	}
	.toolbar {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		padding: 0.6rem;
		background: #fff;
		border-right: 1px solid #e5e7eb;
		width: 100px;
		flex-shrink: 0;
	}
	.tool-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.2rem;
		padding: 0.5rem 0.3rem;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		background: #fff;
		font-size: 0.7rem;
		cursor: pointer;
		transition: all 0.1s;
	}
	.tool-btn:hover { background: #f3f4f6; border-color: #d1d5db; }
	.tool-btn:disabled { opacity: 0.4; cursor: not-allowed; }
	.tool-btn.danger:hover { background: #fee2e2; border-color: #fca5a5; color: #dc2626; }
	.canvas-resize-wrap {
		position: relative;
		display: inline-block;
	}
	.canvas-container {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #e5e7eb;
		overflow: hidden;
		position: relative;
		touch-action: none;
	}
	.canvas-empty {
		text-align: center;
		color: #9ca3af;
	}
	.canvas-empty p { margin: 0.5rem 0 0; }
	.canvas-inner {
		position: relative;
		transform-origin: center center;
		box-shadow: 0 4px 20px rgba(0,0,0,0.15);
		border-radius: 4px;
		overflow: hidden;
		background: #fff;
	}
	.bg-img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
		pointer-events: none;
	}
	.slot-el {
		position: absolute;
		border: 2px dashed rgba(255,255,255,0.7);
		border-radius: 8px;
		cursor: move;
		display: flex;
		align-items: center;
		justify-content: center;
		transition: border-color 0.1s;
		background: rgba(0,0,0,0.08);
	}
	.slot-el.selected {
		border-color: #4f46e5;
		border-style: solid;
		background: rgba(79,70,229,0.08);
	}
	.slot-placeholder {
		pointer-events: none;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
	}
	.slot-label {
		position: absolute;
		top: 4px;
		left: 4px;
		background: rgba(0,0,0,0.5);
		color: #fff;
		border-radius: 4px;
		padding: 1px 6px;
		font-size: 0.7rem;
		pointer-events: none;
	}
	.overlay-el {
		position: absolute;
		cursor: move;
	}
	.overlay-el img {
		width: 100%;
		height: 100%;
		object-fit: contain;
		pointer-events: none;
	}
	.overlay-el.selected {
		outline: 2px solid #4f46e5;
		outline-offset: 2px;
	}
	.resize-handle {
		position: absolute;
		width: 10px;
		height: 10px;
		background: #4f46e5;
		border: 1px solid #fff;
		border-radius: 2px;
		z-index: 10;
		cursor: pointer;
	}
	.resize-handle.nw { top: -5px; left: -5px; cursor: nw-resize; }
	.resize-handle.ne { top: -5px; right: -5px; cursor: ne-resize; }
	.resize-handle.sw { bottom: -5px; left: -5px; cursor: sw-resize; }
	.resize-handle.se { bottom: -5px; right: -5px; cursor: se-resize; }
	.resize-handle.n { top: -5px; left: 50%; margin-left: -5px; cursor: n-resize; }
	.resize-handle.s { bottom: -5px; left: 50%; margin-left: -5px; cursor: s-resize; }
	.resize-handle.e { right: -5px; top: 50%; margin-top: -5px; cursor: e-resize; }
	.resize-handle.w { left: -5px; top: 50%; margin-top: -5px; cursor: w-resize; }
	.canvas-resize-handle {
		position: absolute;
		width: 12px;
		height: 12px;
		background: #4f46e5;
		border: 1px solid #fff;
		border-radius: 2px;
		z-index: 10;
		cursor: pointer;
	}
	.canvas-resize-handle.nw { top: -6px; left: -6px; cursor: nw-resize; }
	.canvas-resize-handle.ne { top: -6px; right: -6px; cursor: ne-resize; }
	.canvas-resize-handle.sw { bottom: -6px; left: -6px; cursor: sw-resize; }
	.canvas-resize-handle.se { bottom: -6px; right: -6px; cursor: se-resize; }
	.canvas-resize-handle.n { top: -6px; left: 50%; margin-left: -6px; cursor: n-resize; }
	.canvas-resize-handle.s { bottom: -6px; left: 50%; margin-left: -6px; cursor: s-resize; }
	.canvas-resize-handle.e { right: -6px; top: 50%; margin-top: -6px; cursor: e-resize; }
	.canvas-resize-handle.w { left: -6px; top: 50%; margin-top: -6px; cursor: w-resize; }
	.sidebar {
		width: 180px;
		padding: 0.8rem;
		background: #fff;
		border-left: 1px solid #e5e7eb;
		overflow-y: auto;
		flex-shrink: 0;
	}
	.sidebar-section h3 {
		margin: 0 0 0.6rem;
		font-size: 0.85rem;
	}
	.sidebar-section label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.3rem;
		font-size: 0.78rem;
		color: #6b7280;
	}
	.sidebar-section label input {
		width: 70px;
		padding: 0.25rem 0.4rem;
		border: 1px solid #d1d5db;
		border-radius: 4px;
		font-size: 0.78rem;
		outline: none;
	}
	.sidebar-section label input:focus { border-color: #4f46e5; }
	.sidebar-empty {
		font-size: 0.8rem;
		color: #9ca3af;
	}
	.sidebar-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.25rem 0;
		margin-top: 0.4rem;
	}
	.sidebar-count {
		font-size: 0.78rem;
		font-weight: 600;
		color: #374151;
	}
	.sidebar-link {
		font-size: 0.75rem;
		font-weight: 600;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		color: #9ca3af;
	}
	.sidebar-link:hover { color: #374151; }
	.sidebar-link.danger:hover { color: #dc2626; }
	.confirm-pop {
		margin-top: 0.6rem;
		padding: 0.5rem;
		border: 1px solid #e5e7eb;
		border-radius: 8px;
		font-size: 0.78rem;
		color: #374151;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		animation: confirm-in 0.15s ease-out;
	}
	.confirm-btn {
		padding: 0.25rem 0.6rem;
		border: 1px solid #d1d5db;
		border-radius: 5px;
		background: #fff;
		font-size: 0.73rem;
		font-weight: 600;
		cursor: pointer;
	}
	.confirm-btn:hover { background: #f3f4f6; }
	.confirm-btn.ya {
		background: #dc2626;
		border-color: #dc2626;
		color: #fff;
	}
	.confirm-btn.ya:hover { opacity: 0.85; }
	@keyframes confirm-in {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}
</style>
