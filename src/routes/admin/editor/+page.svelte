<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { untrack } from 'svelte';
	import { SLOT_WIDTH, SLOT_HEIGHT } from '$lib/data/admin-types';

	import type { Slot, Overlay, TemplateRecord } from '$lib/data/admin-types';
	let { data }: { data: { template: TemplateRecord | null } } = $props();

	const initialTemplate = untrack(() => data.template);

	let id = $state(initialTemplate?.id ?? 0);
	let name = $state(initialTemplate?.name ?? '');
	let backgroundPath = $state(initialTemplate?.background_path ?? '');
	let canvasWidth = $state(initialTemplate?.canvas_width ?? 0);
	let canvasHeight = $state(initialTemplate?.canvas_height ?? 0);
	let slots = $state<Slot[]>(initialTemplate?.slots ?? []);
	let overlays = $state<Overlay[]>(initialTemplate?.overlays ?? []);
	let selectedId = $state<string | null>(null);
	let saving = $state(false);
	let dragState: { type: 'move' | 'resize' | 'canvas-resize' | 'bg-move'; elementId?: string; startX: number; startY: number; origX: number; origY: number; origW: number; origH: number; handle?: string } | null = null;
	let canvasEl = $state<HTMLDivElement | undefined>(undefined);
	let canvasScale = $state(1);
	let confirmDelete = $state<'slots' | 'overlays' | null>(null);
	let layerPulsingId = $state<string | null>(null);
	let pulseTimer: ReturnType<typeof setTimeout> | undefined;

	let showRulers = $state(true);
	let activeGuides = $state<{ type: 'h' | 'v'; pos: number }[]>([]);

	let rulerXTicks = $derived.by(() => {
		if (!canvasWidth) return [];
		const ticks: number[] = [];
		const step = canvasWidth > 2000 ? 200 : canvasWidth > 800 ? 100 : 50;
		for (let x = 0; x <= canvasWidth; x += step) {
			ticks.push(x);
		}
		return ticks;
	});

	let rulerYTicks = $derived.by(() => {
		if (!canvasHeight) return [];
		const ticks: number[] = [];
		const step = canvasHeight > 2000 ? 200 : canvasHeight > 800 ? 100 : 50;
		for (let y = 0; y <= canvasHeight; y += step) {
			ticks.push(y);
		}
		return ticks;
	});

	interface CanvasPreset {
		id: number;
		name: string;
		width: number;
		height: number;
	}

	let canvasPresets = $state<CanvasPreset[]>([]);

	$effect(() => {
		if (browser) {
			fetchPresets();
		}
	});

	async function fetchPresets() {
		try {
			const res = await fetch('/api/presets');
			if (res.ok) {
				canvasPresets = await res.json();
			}
		} catch {}
	}

	async function addCanvasPreset() {
		if (!canvasWidth || !canvasHeight) return;
		if (canvasPresets.length >= 10) return;
		try {
			const res = await fetch('/api/presets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ width: canvasWidth, height: canvasHeight })
			});
			if (res.ok) {
				const created = await res.json();
				canvasPresets = [...canvasPresets, created];
			}
		} catch {}
	}

	function applyCanvasPreset(preset: CanvasPreset) {
		canvasWidth = preset.width;
		canvasHeight = preset.height;
	}

	async function removeCanvasPreset(id: number) {
		try {
			const res = await fetch(`/api/presets/${id}`, { method: 'DELETE' });
			if (res.ok) {
				canvasPresets = canvasPresets.filter(p => p.id !== id);
			}
		} catch {}
	}

	function triggerLayerPulse(id: string) {
		layerPulsingId = id;
		if (pulseTimer) clearTimeout(pulseTimer);
		pulseTimer = setTimeout(() => { layerPulsingId = null; }, 400);
	}

	let nextOverlayId = $state(overlays.length + 1);

	let bgNaturalWidth = $state(0);
	let bgNaturalHeight = $state(0);
	let bgOffsetX = $state(initialTemplate?.bg_offset_x ?? 0);
	let bgOffsetY = $state(initialTemplate?.bg_offset_y ?? 0);

	let bgCoverStyle = $derived.by(() => {
		if (!backgroundPath || !bgNaturalWidth || !bgNaturalHeight || !canvasWidth || !canvasHeight) return '';
		const s = Math.max(canvasWidth / bgNaturalWidth, canvasHeight / bgNaturalHeight);
		const w = Math.round(bgNaturalWidth * s);
		const h = Math.round(bgNaturalHeight * s);
		const maxDx = Math.max(0, (w - canvasWidth) / 2);
		const maxDy = Math.max(0, (h - canvasHeight) / 2);
		const ox = Math.max(-maxDx, Math.min(maxDx, bgOffsetX));
		const oy = Math.max(-maxDy, Math.min(maxDy, bgOffsetY));
		const left = Math.round((canvasWidth - w) / 2 + ox);
		const top = Math.round((canvasHeight - h) / 2 + oy);
		return `position: absolute; width: ${w}px; height: ${h}px; left: ${left}px; top: ${top}px;`;
	});

	$effect(() => {
		if (!backgroundPath || !browser) {
			bgNaturalWidth = 0;
			bgNaturalHeight = 0;
			return;
		}
		const img = new Image();
		img.onload = () => {
			bgNaturalWidth = img.naturalWidth;
			bgNaturalHeight = img.naturalHeight;
		};
		img.src = backgroundPath;
		return () => { img.onload = null; };
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

	function duplicateSelectedSlot() {
		if (!selectedId || !selectedId.startsWith('slot-')) return;
		if (slots.length >= 8) return;
		const idx = parseInt(selectedId.replace('slot-', '')) - 1;
		if (idx >= 0 && idx < slots.length) {
			const src = slots[idx];
			const newX = Math.max(0, Math.min(src.x + 20, (canvasWidth || 800) - src.width));
			const newY = Math.max(0, Math.min(src.y + 20, (canvasHeight || 1000) - src.height));
			const newSlot: Slot = {
				x: Math.round(newX),
				y: Math.round(newY),
				width: src.width,
				height: src.height
			};
			slots = [...slots, newSlot];
			selectedId = 'slot-' + slots.length;
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		const tag = (e.target as HTMLElement)?.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA') return;

		if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
			if (selectedId && selectedId.startsWith('slot-')) {
				e.preventDefault();
				duplicateSelectedSlot();
			}
		} else if ((e.ctrlKey || e.metaKey) && e.key === ']') {
			if (selectedId) {
				e.preventDefault();
				if (e.shiftKey) moveLayerToFront();
				else moveLayerUp();
			}
		} else if ((e.ctrlKey || e.metaKey) && e.key === '[') {
			if (selectedId) {
				e.preventDefault();
				if (e.shiftKey) moveLayerToBack();
				else moveLayerDown();
			}
		} else if (e.key === 'Delete' || e.key === 'Backspace') {
			if (selectedId) {
				e.preventDefault();
				removeSelected();
			}
		}
	}

	function moveLayerUp() {
		if (!selectedId) return;
		if (selectedId.startsWith('slot-')) {
			const idx = getSelectedSlotIndex();
			if (idx < 0 || idx >= slots.length - 1) return;
			const newSlots = [...slots];
			const temp = newSlots[idx];
			newSlots[idx] = newSlots[idx + 1];
			newSlots[idx + 1] = temp;
			slots = newSlots;
			selectedId = 'slot-' + (idx + 2);
			triggerLayerPulse(selectedId);
		} else {
			const idx = overlays.findIndex(o => o.id === selectedId);
			if (idx < 0 || idx >= overlays.length - 1) return;
			const newOverlays = [...overlays];
			const temp = newOverlays[idx];
			newOverlays[idx] = newOverlays[idx + 1];
			newOverlays[idx + 1] = temp;
			overlays = newOverlays;
			triggerLayerPulse(selectedId);
		}
	}

	function moveLayerDown() {
		if (!selectedId) return;
		if (selectedId.startsWith('slot-')) {
			const idx = getSelectedSlotIndex();
			if (idx <= 0) return;
			const newSlots = [...slots];
			const temp = newSlots[idx];
			newSlots[idx] = newSlots[idx - 1];
			newSlots[idx - 1] = temp;
			slots = newSlots;
			selectedId = 'slot-' + idx;
			triggerLayerPulse(selectedId);
		} else {
			const idx = overlays.findIndex(o => o.id === selectedId);
			if (idx <= 0) return;
			const newOverlays = [...overlays];
			const temp = newOverlays[idx];
			newOverlays[idx] = newOverlays[idx - 1];
			newOverlays[idx - 1] = temp;
			overlays = newOverlays;
			triggerLayerPulse(selectedId);
		}
	}

	function moveLayerToFront() {
		if (!selectedId) return;
		if (selectedId.startsWith('slot-')) {
			const idx = getSelectedSlotIndex();
			if (idx < 0 || idx >= slots.length - 1) return;
			const target = slots[idx];
			const newSlots = slots.filter((_, i) => i !== idx);
			newSlots.push(target);
			slots = newSlots;
			selectedId = 'slot-' + slots.length;
			triggerLayerPulse(selectedId);
		} else {
			const idx = overlays.findIndex(o => o.id === selectedId);
			if (idx < 0 || idx >= overlays.length - 1) return;
			const target = overlays[idx];
			const newOverlays = overlays.filter((_, i) => i !== idx);
			newOverlays.push(target);
			overlays = newOverlays;
			triggerLayerPulse(selectedId);
		}
	}

	function moveLayerToBack() {
		if (!selectedId) return;
		if (selectedId.startsWith('slot-')) {
			const idx = getSelectedSlotIndex();
			if (idx <= 0) return;
			const target = slots[idx];
			const newSlots = slots.filter((_, i) => i !== idx);
			newSlots.unshift(target);
			slots = newSlots;
			selectedId = 'slot-1';
			triggerLayerPulse(selectedId);
		} else {
			const idx = overlays.findIndex(o => o.id === selectedId);
			if (idx <= 0) return;
			const target = overlays[idx];
			const newOverlays = overlays.filter((_, i) => i !== idx);
			newOverlays.unshift(target);
			overlays = newOverlays;
			triggerLayerPulse(selectedId);
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
		if (ds.type === 'bg-move') {
			bgOffsetX = Math.round(ds.origX + dx);
			bgOffsetY = Math.round(ds.origY + dy);
		} else if (ds.type === 'move' || ds.type === 'resize') {
			let nx = ds.origX;
			let ny = ds.origY;
			let nw = ds.origW;
			let nh = ds.origH;

			if (ds.type === 'move') {
				nx = ds.origX + dx;
				ny = ds.origY + dy;
			} else if (ds.type === 'resize') {
				const handle = ds.handle!;
				if (handle.includes('e')) nw = Math.max(50, ds.origW + dx);
				if (handle.includes('w')) { nw = Math.max(50, ds.origW - dx); nx = ds.origX + dx; }
				if (handle.includes('s')) nh = Math.max(50, ds.origH + dy);
				if (handle.includes('n')) { nh = Math.max(50, ds.origH - dy); ny = ds.origY + dy; }
			}

			// Smart alignment snapping
			const newGuides: { type: 'h' | 'v'; pos: number }[] = [];
			if (showRulers) {
				const SNAP = 6; // snap threshold in canvas px
				const eid = ds.elementId;

				// Gather target snap lines
				const targetX: number[] = [0, canvasWidth / 2, canvasWidth];
				const targetY: number[] = [0, canvasHeight / 2, canvasHeight];

				slots.forEach((s, i) => {
					if (eid !== 'slot-' + (i + 1)) {
						targetX.push(s.x, s.x + s.width / 2, s.x + s.width);
						targetY.push(s.y, s.y + s.height / 2, s.y + s.height);
					}
				});
				overlays.forEach(o => {
					if (eid !== o.id) {
						targetX.push(o.x, o.x + o.width / 2, o.x + o.width);
						targetY.push(o.y, o.y + o.height / 2, o.y + o.height);
					}
				});

				// Test X points
				const testX = [
					{ point: nx, offset: 0 },
					{ point: nx + nw / 2, offset: nw / 2 },
					{ point: nx + nw, offset: nw }
				];
				let snappedX = false;
				for (const tx of targetX) {
					for (const test of testX) {
						if (Math.abs(test.point - tx) < SNAP) {
							nx = tx - test.offset;
							newGuides.push({ type: 'v', pos: Math.round(tx) });
							snappedX = true;
							break;
						}
					}
					if (snappedX) break;
				}

				// Test Y points
				const testY = [
					{ point: ny, offset: 0 },
					{ point: ny + nh / 2, offset: nh / 2 },
					{ point: ny + nh, offset: nh }
				];
				let snappedY = false;
				for (const ty of targetY) {
					for (const test of testY) {
						if (Math.abs(test.point - ty) < SNAP) {
							ny = ty - test.offset;
							newGuides.push({ type: 'h', pos: Math.round(ty) });
							snappedY = true;
							break;
						}
					}
					if (snappedY) break;
				}
			}
			activeGuides = newGuides;

			const eid = ds.elementId;
			if (!eid) return;

			if (eid.startsWith('slot-')) {
				const idx = parseInt(eid.replace('slot-', '')) - 1;
				if (idx >= 0 && idx < slots.length) {
					slots = slots.map((s, i) => i === idx ? { ...s, x: Math.round(nx), y: Math.round(ny), width: Math.round(nw), height: Math.round(nh) } : s);
				}
			} else {
				overlays = overlays.map(o =>
					o.id === eid ? { ...o, x: Math.round(nx), y: Math.round(ny), width: Math.round(nw), height: Math.round(nh) } : o
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
		activeGuides = [];
	}


	function handleBgPointerDown(e: PointerEvent) {
		e.stopPropagation();
		selectedId = null;
		const coords = toCanvasCoords(e.clientX, e.clientY);
		if (!coords) return;
		dragState = {
			type: 'bg-move',
			startX: coords.x,
			startY: coords.y,
			origX: bgOffsetX,
			origY: bgOffsetY,
			origW: 0,
			origH: 0
		};
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
			overlays,
			bg_offset_x: Math.round(bgOffsetX),
			bg_offset_y: Math.round(bgOffsetY)
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

<svelte:window onkeydown={handleKeydown} />

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
			<button
				class="tool-btn"
				class:active={showRulers}
				onclick={() => (showRulers = !showRulers)}
				title="Toggle Ruler & Smart Snapping"
			>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12h20"/><path d="M6 12v-3"/><path d="M10 12v-2"/><path d="M14 12v-3"/><path d="M18 12v-2"/></svg>
				Ruler & Snap
			</button>
			{#if selectedId}
				{#if selectedId.startsWith('slot-')}
					<button
						class="tool-btn"
						onclick={duplicateSelectedSlot}
						disabled={slots.length >= 8}
						title="Duplikat Slot Foto (Ctrl+D)"
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
						Duplikat
					</button>
				{/if}
				<button class="tool-btn danger" onclick={removeSelected} title="Hapus (Delete)">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
					Hapus
				</button>
			{/if}
		</div>

		<div
			class="canvas-container"
			role="application"
			aria-label="Editor Canvas"
			bind:this={canvasEl}
			onpointermove={handlePointerMove}
			onpointerup={handlePointerUp}
			onpointerleave={handlePointerUp}
			onclick={handleCanvasClick}
			onkeydown={(e) => { if (e.key === 'Enter') handleCanvasClick(e as any) }}
			tabindex="0"
		>
			{#if !backgroundPath}
				<div class="canvas-empty">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5-5 5"/></svg>
					<p>Upload background untuk memulai</p>
				</div>
			{:else}
				{@const scale = getCanvasScale()}
				<div class="canvas-resize-wrap" style="width: {canvasWidth * scale}px; height: {canvasHeight * scale}px;">
					{#if showRulers}
						<div class="ruler ruler-top">
							{#each rulerXTicks as x}
								<div class="ruler-tick" style="left: {x * scale}px;">
									<span class="ruler-label">{x}</span>
								</div>
							{/each}
						</div>
						<div class="ruler ruler-left">
							{#each rulerYTicks as y}
								<div class="ruler-tick" style="top: {y * scale}px;">
									<span class="ruler-label">{y}</span>
								</div>
							{/each}
						</div>
					{/if}
					<div
						class="canvas-inner"
						style="width: {canvasWidth}px; height: {canvasHeight}px; transform: scale({scale}); transform-origin: top left;"
					>
					<img src={backgroundPath} alt="BG" class="bg-img" draggable="false" style={bgCoverStyle} onpointerdown={(e) => handleBgPointerDown(e)} />

					{#if showRulers && activeGuides.length > 0}
						{#each activeGuides as guide}
							{#if guide.type === 'v'}
								<div class="smart-guide vertical" style="left: {guide.pos}px;"></div>
							{:else}
								<div class="smart-guide horizontal" style="top: {guide.pos}px;"></div>
							{/if}
						{/each}
					{/if}

					{#each slots as slot, i}
						{@const sid = 'slot-' + (i + 1)}
						<div
							class="slot-el"
							role="button"
							tabindex="-1"
							class:selected={selectedId === sid}
							class:layer-pulsing={layerPulsingId === sid}
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
										role="slider"
										aria-label="Resize slot"
										aria-valuenow={0}
										tabindex="-1"
										onpointerdown={(e) => handleResizePointerDown(e, 'slot', sid, handle)}
									></div>
								{/each}
							{/if}
						</div>
					{/each}

					{#each overlays as ov, i}
						<div
							class="overlay-el"
							role="button"
							tabindex="-1"
							class:selected={selectedId === ov.id}
							class:layer-pulsing={layerPulsingId === ov.id}
							style="left: {ov.x}px; top: {ov.y}px; width: {ov.width}px; height: {ov.height}px; transform: rotate({ov.rotation}deg);"
							onpointerdown={(e) => handlePointerDown(e, 'overlay', ov.id)}
						>
							<img src={ov.src} alt="" draggable="false" />
							{#if selectedId === ov.id}
								<div class="overlay-badge">Overlay {i + 1} ({i + 1}/{overlays.length})</div>
								{#each ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'] as handle}
									<div
										class="resize-handle {handle}"
										role="slider"
										aria-label="Resize overlay"
										aria-valuenow={0}
										tabindex="-1"
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
							role="slider"
							aria-label="Resize canvas"
							aria-valuenow={0}
							tabindex="-1"
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
				{@const idx = isSlot ? getSelectedSlotIndex() : overlays.findIndex(o => o.id === selectedId)}
				{@const ov = getSelectedOverlay()}
				{@const totalLayers = isSlot ? slots.length : overlays.length}
				{@const isTopLayer = idx >= totalLayers - 1}
				{@const isBottomLayer = idx <= 0}
				<div class="sidebar-section">
					<h3>{isSlot ? 'Slot ' + (idx + 1) : 'Overlay'}</h3>
					{#if isSlot && idx >= 0}
						{@const s = slots[idx]}
						<label>X <input type="number" value={Math.round(s.x)} oninput={(e) => updateSlotPos(idx, 'x', parseInt((e.target as HTMLInputElement).value) || 0)} /></label>
						<label>Y <input type="number" value={Math.round(s.y)} oninput={(e) => updateSlotPos(idx, 'y', parseInt((e.target as HTMLInputElement).value) || 0)} /></label>
						<label>W <input type="number" value={Math.round(s.width)} oninput={(e) => updateSlotPos(idx, 'width', parseInt((e.target as HTMLInputElement).value) || 50)} /></label>
						<label>H <input type="number" value={Math.round(s.height)} oninput={(e) => updateSlotPos(idx, 'height', parseInt((e.target as HTMLInputElement).value) || 50)} /></label>
						<button
							class="sidebar-action-btn"
							onclick={duplicateSelectedSlot}
							disabled={slots.length >= 8}
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
							Duplikat Slot
						</button>
					{:else if ov}
						<label>X <input type="number" value={Math.round(ov.x)} oninput={(e) => updateOverlay('x', parseInt((e.target as HTMLInputElement).value) || 0)} /></label>
						<label>Y <input type="number" value={Math.round(ov.y)} oninput={(e) => updateOverlay('y', parseInt((e.target as HTMLInputElement).value) || 0)} /></label>
						<label>W <input type="number" value={Math.round(ov.width)} oninput={(e) => updateOverlay('width', parseInt((e.target as HTMLInputElement).value) || 50)} /></label>
						<label>H <input type="number" value={Math.round(ov.height)} oninput={(e) => updateOverlay('height', parseInt((e.target as HTMLInputElement).value) || 50)} /></label>
						<label>Rot <input type="number" value={ov.rotation} oninput={(e) => updateOverlay('rotation', parseFloat((e.target as HTMLInputElement).value) || 0)} /></label>
					{/if}

					<div class="layer-section">
						<div class="layer-title">Posisi Layer ({idx + 1}/{totalLayers})</div>
						<div class="layer-grid">
							<button class="layer-btn" onclick={moveLayerToFront} disabled={isTopLayer || totalLayers <= 1} title="Paling Depan (Ctrl+Shift+])">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m17 11-5-5-5 5"/><path d="m17 18-5-5-5 5"/></svg>
								Paling Depan
							</button>
							<button class="layer-btn" onclick={moveLayerToBack} disabled={isBottomLayer || totalLayers <= 1} title="Paling Belakang (Ctrl+Shift+[)">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 13 5 5 5-5"/><path d="m7 6 5 5 5-5"/></svg>
								Paling Belakang
							</button>
							<button class="layer-btn" onclick={moveLayerUp} disabled={isTopLayer || totalLayers <= 1} title="Ke Atas (Ctrl+])">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m18 15-6-6-6 6"/></svg>
								Ke Atas
							</button>
							<button class="layer-btn" onclick={moveLayerDown} disabled={isBottomLayer || totalLayers <= 1} title="Ke Bawah (Ctrl+[)">
								<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
								Ke Bawah
							</button>
						</div>
					</div>
				</div>
			{:else}
				{#if canvasWidth > 0}
					<div class="sidebar-section">
						<h3>Canvas (px)</h3>
						<label>W (px) <input type="number" bind:value={canvasWidth} min="1" /></label>
						<label>H (px) <input type="number" bind:value={canvasHeight} min="1" /></label>
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

			<div class="sidebar-section preset-section">
				<h3>Default Ukuran Canvas</h3>
				{#if canvasPresets.length > 0}
					<div class="preset-list">
						{#each canvasPresets as preset}
							<div class="preset-item">
								<button
									class="preset-apply-btn"
									onclick={() => applyCanvasPreset(preset)}
									title="Gunakan {preset.name} ({preset.width}×{preset.height} px)"
								>
									<span class="preset-title">{preset.name}</span>
									<span class="preset-dim">{preset.width} × {preset.height} px</span>
								</button>
								<button
									class="preset-del-btn"
									onclick={() => removeCanvasPreset(preset.id)}
									title="Hapus default"
								>
									×
								</button>
							</div>
						{/each}
					</div>
				{/if}
				<button
					class="add-preset-btn"
					onclick={addCanvasPreset}
					disabled={canvasPresets.length >= 10 || !canvasWidth || !canvasHeight}
				>
					+ Tambah Default Canvas ({canvasPresets.length}/10)
				</button>
			</div>

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
	.tool-btn.danger:hover {
		background: #fef2f2;
		border-color: #fca5a5;
		color: #dc2626;
	}
	.sidebar-action-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.45rem 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		background: #fff;
		font-size: 0.85rem;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		transition: background 0.1s;
	}
	.sidebar-action-btn:hover:not(:disabled) {
		background: #f3f4f6;
		border-color: #9ca3af;
	}
	.sidebar-action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.layer-section {
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid #e5e7eb;
	}
	.layer-title {
		font-size: 0.8rem;
		font-weight: 600;
		color: #6b7280;
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
	}
	.layer-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}
	.layer-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		padding: 0.4rem 0.5rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		background: #fff;
		font-size: 0.75rem;
		font-weight: 500;
		color: #374151;
		cursor: pointer;
		transition: all 0.1s;
	}
	.layer-btn:hover:not(:disabled) {
		background: #f3f4f6;
		border-color: #9ca3af;
		color: #111827;
	}
	.layer-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
		background: #f9fafb;
		border-color: #e5e7eb;
		color: #9ca3af;
	}
	.overlay-badge {
		position: absolute;
		top: -24px;
		left: 50%;
		transform: translateX(-50%);
		background: #4f46e5;
		color: #fff;
		font-size: 0.65rem;
		font-weight: 600;
		padding: 0.15rem 0.45rem;
		border-radius: 4px;
		white-space: nowrap;
		pointer-events: none;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
		z-index: 10;
	}
	.layer-pulsing {
		animation: layerGlowPulse 0.4s cubic-bezier(0, 0, 0.2, 1);
	}
	@keyframes layerGlowPulse {
		0% { outline: 3px solid #6366f1; outline-offset: 2px; box-shadow: 0 0 12px rgba(99, 102, 241, 0.8); }
		50% { outline: 4px solid #818cf8; outline-offset: 4px; box-shadow: 0 0 20px rgba(99, 102, 241, 0.9); }
		100% { outline: 2px solid #4f46e5; outline-offset: 0px; box-shadow: none; }
	}
	.preset-section {
		margin-top: 1.25rem;
		padding-top: 0.75rem;
		border-top: 1px solid #e5e7eb;
	}
	.preset-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-bottom: 0.6rem;
	}
	.preset-item {
		display: flex;
		align-items: center;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		background: #fff;
		overflow: hidden;
		transition: border-color 0.1s;
	}
	.preset-item:hover {
		border-color: #cbd5e1;
	}
	.preset-apply-btn {
		flex: 1;
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 0.1rem;
		padding: 0.4rem 0.6rem;
		border: none;
		background: transparent;
		font-size: 0.8rem;
		cursor: pointer;
		text-align: left;
	}
	.preset-apply-btn:hover {
		background: #f8fafc;
	}
	.preset-title {
		font-weight: 600;
		color: #334155;
	}
	.preset-dim {
		font-size: 0.7rem;
		color: #94a3b8;
	}
	.preset-del-btn {
		padding: 0.4rem 0.55rem;
		border: none;
		background: transparent;
		color: #94a3b8;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
	}
	.preset-del-btn:hover {
		color: #ef4444;
		background: #fef2f2;
	}
	.add-preset-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.5rem;
		border: 1px dashed #cbd5e1;
		border-radius: 6px;
		background: #f8fafc;
		font-size: 0.8rem;
		font-weight: 600;
		color: #4f46e5;
		cursor: pointer;
		transition: all 0.1s;
	}
	.add-preset-btn:hover:not(:disabled) {
		border-color: #6366f1;
		background: #eef2ff;
	}
	.add-preset-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
		border-style: solid;
	}
	.tool-btn.active {
		background: #e0e7ff;
		border-color: #6366f1;
		color: #4338ca;
	}
	.ruler {
		position: absolute;
		pointer-events: none;
		user-select: none;
		z-index: 5;
	}
	.ruler-top {
		top: -24px;
		left: 0;
		right: 0;
		height: 20px;
		border-bottom: 1px solid #cbd5e1;
		background: rgba(255, 255, 255, 0.9);
		backdrop-filter: blur(4px);
		border-radius: 4px 4px 0 0;
	}
	.ruler-top .ruler-tick {
		position: absolute;
		top: 10px;
		bottom: 0;
		width: 1px;
		background: #94a3b8;
	}
	.ruler-top .ruler-label {
		position: absolute;
		top: -10px;
		left: 2px;
		font-size: 0.6rem;
		font-weight: 600;
		color: #64748b;
		white-space: nowrap;
	}
	.ruler-left {
		top: 0;
		bottom: 0;
		left: -24px;
		width: 20px;
		border-right: 1px solid #cbd5e1;
		background: rgba(255, 255, 255, 0.9);
		backdrop-filter: blur(4px);
		border-radius: 4px 0 0 4px;
	}
	.ruler-left .ruler-tick {
		position: absolute;
		left: 10px;
		right: 0;
		height: 1px;
		background: #94a3b8;
	}
	.ruler-left .ruler-label {
		position: absolute;
		left: -18px;
		top: 1px;
		font-size: 0.6rem;
		font-weight: 600;
		color: #64748b;
		white-space: nowrap;
		transform: rotate(-90deg);
		transform-origin: right top;
	}
	.smart-guide {
		position: absolute;
		pointer-events: none;
		z-index: 99;
	}
	.smart-guide.vertical {
		top: 0;
		bottom: 0;
		width: 1.5px;
		background: #ec4899;
		box-shadow: 0 0 6px rgba(236, 72, 153, 0.8);
	}
	.smart-guide.horizontal {
		left: 0;
		right: 0;
		height: 1.5px;
		background: #ec4899;
		box-shadow: 0 0 6px rgba(236, 72, 153, 0.8);
	}
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
		position: absolute;
		display: block;
		pointer-events: all;
		cursor: grab;
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
		width: 24px;
		height: 24px;
		background: #4f46e5;
		border: 2px solid #fff;
		border-radius: 4px;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
		z-index: 20;
		cursor: pointer;
	}
	.resize-handle::before {
		content: '';
		position: absolute;
		top: -12px;
		left: -12px;
		right: -12px;
		bottom: -12px;
	}
	.resize-handle.nw { top: -12px; left: -12px; cursor: nw-resize; }
	.resize-handle.ne { top: -12px; right: -12px; cursor: ne-resize; }
	.resize-handle.sw { bottom: -12px; left: -12px; cursor: sw-resize; }
	.resize-handle.se { bottom: -12px; right: -12px; cursor: se-resize; }
	.resize-handle.n { top: -12px; left: 50%; margin-left: -12px; cursor: n-resize; }
	.resize-handle.s { bottom: -12px; left: 50%; margin-left: -12px; cursor: s-resize; }
	.resize-handle.e { right: -12px; top: 50%; margin-top: -12px; cursor: e-resize; }
	.resize-handle.w { left: -12px; top: 50%; margin-top: -12px; cursor: w-resize; }

	.canvas-resize-handle {
		position: absolute;
		width: 24px;
		height: 24px;
		background: #4f46e5;
		border: 2px solid #fff;
		border-radius: 4px;
		box-shadow: 0 2px 6px rgba(0, 0, 0, 0.3);
		z-index: 20;
		cursor: pointer;
	}
	.canvas-resize-handle::before {
		content: '';
		position: absolute;
		top: -12px;
		left: -12px;
		right: -12px;
		bottom: -12px;
	}
	.canvas-resize-handle.nw { top: -12px; left: -12px; cursor: nw-resize; }
	.canvas-resize-handle.ne { top: -12px; right: -12px; cursor: ne-resize; }
	.canvas-resize-handle.sw { bottom: -12px; left: -12px; cursor: sw-resize; }
	.canvas-resize-handle.se { bottom: -12px; right: -12px; cursor: se-resize; }
	.canvas-resize-handle.n { top: -12px; left: 50%; margin-left: -12px; cursor: n-resize; }
	.canvas-resize-handle.s { bottom: -12px; left: 50%; margin-left: -12px; cursor: s-resize; }
	.canvas-resize-handle.e { right: -12px; top: 50%; margin-top: -12px; cursor: e-resize; }
	.canvas-resize-handle.w { left: -12px; top: 50%; margin-top: -12px; cursor: w-resize; }
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
