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

	let isNewTemplate = !initialTemplate || (initialTemplate.id === 0 && !initialTemplate.background_path && !initialTemplate.canvas_width);
	let showNewTemplateModal = $state(isNewTemplate);

	let activeGuides = $state<{ type: 'h' | 'v'; pos: number }[]>([]);

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
			fetchSlotPresets();
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

	interface SlotPreset {
		id: number;
		name: string;
		width: number;
		height: number;
	}
	let slotPresets = $state<SlotPreset[]>([]);

	async function fetchSlotPresets() {
		try {
			const res = await fetch('/api/slot-presets');
			if (res.ok) {
				slotPresets = await res.json();
			}
		} catch {}
	}

	async function addSlotPreset(w: number, h: number) {
		if (slotPresets.length >= 10) return;
		try {
			const res = await fetch('/api/slot-presets', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ width: w, height: h })
			});
			if (res.ok) {
				const created = await res.json();
				slotPresets = [...slotPresets, created];
			}
		} catch {}
	}

	async function removeSlotPreset(id: number) {
		try {
			const res = await fetch(`/api/slot-presets/${id}`, { method: 'DELETE' });
			if (res.ok) {
				slotPresets = slotPresets.filter(p => p.id !== id);
			}
		} catch {}
	}

	function applySlotPreset(idx: number, preset: SlotPreset) {
		updateSlotPos(idx, 'width', preset.width);
		updateSlotPos(idx, 'height', preset.height);
	}

	function triggerLayerPulse(id: string) {
		layerPulsingId = id;
		if (pulseTimer) clearTimeout(pulseTimer);
		pulseTimer = setTimeout(() => { layerPulsingId = null; }, 400);
	}

	let nextOverlayId = $state(untrack(() => overlays.length + 1));

	let bgNaturalWidth = $state(0);
	let bgNaturalHeight = $state(0);
	let bgOffsetX = $state(initialTemplate?.bg_offset_x ?? 0);
	let bgOffsetY = $state(initialTemplate?.bg_offset_y ?? 0);
	let bgRotation = $state(initialTemplate?.bg_rotation ?? 0);

	let bgCoverStyle = $derived.by(() => {
		if (!backgroundPath || !canvasWidth || !canvasHeight) return '';
		return `position: absolute; width: ${canvasWidth}px; height: ${canvasHeight}px; left: ${bgOffsetX}px; top: ${bgOffsetY}px; transform: rotate(${bgRotation}deg); transform-origin: center center;`;
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
				if (!canvasWidth || !canvasHeight) {
					canvasWidth = img.naturalWidth;
					canvasHeight = img.naturalHeight;
				}
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
			{
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
			bg_offset_y: Math.round(bgOffsetY),
			bg_rotation: Math.round(bgRotation)
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
	{#if showNewTemplateModal}
		<div class="modal-overlay">
			<div class="modal-content">
				<h2>Pilih Ukuran Kertas</h2>
				<p>Pilih ukuran kanvas untuk memulai desain template baru.</p>
				<div class="modal-options">
					<button onclick={() => { canvasWidth = 2480; canvasHeight = 3508; showNewTemplateModal = false; }}>
						<span class="paper-name">A4</span>
						<span class="paper-dim">21 × 29.7 cm</span>
					</button>
					<button onclick={() => { canvasWidth = 1204; canvasHeight = 1795; showNewTemplateModal = false; }}>
						<span class="paper-name">4R</span>
						<span class="paper-dim">10.2 × 15.2 cm</span>
					</button>
					<button class="outline" onclick={() => { showNewTemplateModal = false; }}>
						<span class="paper-name">Bebas (Custom)</span>
						<span class="paper-dim">Mulai dari kanvas kosong</span>
					</button>
				</div>
			</div>
		</div>
	{/if}

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

		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
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
					<div
						class="canvas-inner"
						style="width: {canvasWidth}px; height: {canvasHeight}px; transform: scale({scale}); transform-origin: top left;"
					>
					<img src={backgroundPath} alt="BG" class="bg-img" draggable="false" style={bgCoverStyle} onpointerdown={(e) => handleBgPointerDown(e)} />

					{#if activeGuides.length > 0}
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
						<label>X (cm) <input type="number" step="0.1" value={+(s.x / 118.11).toFixed(2)} oninput={(e) => updateSlotPos(idx, 'x', Math.round(parseFloat((e.target as HTMLInputElement).value) * 118.11) || 0)} /></label>
						<label>Y (cm) <input type="number" step="0.1" value={+(s.y / 118.11).toFixed(2)} oninput={(e) => updateSlotPos(idx, 'y', Math.round(parseFloat((e.target as HTMLInputElement).value) * 118.11) || 0)} /></label>
						<label>W (cm) <input type="number" step="0.1" value={+(s.width / 118.11).toFixed(2)} oninput={(e) => updateSlotPos(idx, 'width', Math.round(parseFloat((e.target as HTMLInputElement).value) * 118.11) || 50)} /></label>
						<label>H (cm) <input type="number" step="0.1" value={+(s.height / 118.11).toFixed(2)} oninput={(e) => updateSlotPos(idx, 'height', Math.round(parseFloat((e.target as HTMLInputElement).value) * 118.11) || 50)} /></label>
						<button
							class="sidebar-action-btn"
							onclick={duplicateSelectedSlot}
							disabled={slots.length >= 8}
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
							Duplikat Slot
						</button>

						<div class="sidebar-section preset-section">
							<h3>Default Ukuran Slot</h3>
							{#if slotPresets.length > 0}
								<div class="preset-list">
									{#each slotPresets as preset}
										<div class="preset-item">
											<button
												class="preset-apply-btn"
												onclick={() => applySlotPreset(idx, preset)}
												title="Gunakan {preset.name}"
											>
												<span class="preset-title">{preset.name}</span>
												<span class="preset-dim">{+(preset.width / 118.11).toFixed(2)} × {+(preset.height / 118.11).toFixed(2)} cm</span>
											</button>
											<button
												class="preset-del-btn"
												onclick={() => removeSlotPreset(preset.id)}
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
								onclick={() => addSlotPreset(s.width, s.height)}
								disabled={slotPresets.length >= 10}
							>
								+ Simpan Ukuran Slot ({slotPresets.length}/10)
							</button>
						</div>
					{:else if ov}
						<label>X (cm) <input type="number" step="0.1" value={+(ov.x / 118.11).toFixed(2)} oninput={(e) => updateOverlay('x', Math.round(parseFloat((e.target as HTMLInputElement).value) * 118.11) || 0)} /></label>
						<label>Y (cm) <input type="number" step="0.1" value={+(ov.y / 118.11).toFixed(2)} oninput={(e) => updateOverlay('y', Math.round(parseFloat((e.target as HTMLInputElement).value) * 118.11) || 0)} /></label>
						<label>W (cm) <input type="number" step="0.1" value={+(ov.width / 118.11).toFixed(2)} oninput={(e) => updateOverlay('width', Math.round(parseFloat((e.target as HTMLInputElement).value) * 118.11) || 50)} /></label>
						<label>H (cm) <input type="number" step="0.1" value={+(ov.height / 118.11).toFixed(2)} oninput={(e) => updateOverlay('height', Math.round(parseFloat((e.target as HTMLInputElement).value) * 118.11) || 50)} /></label>
						<label>Rotasi <input type="number" value={ov.rotation} oninput={(e) => updateOverlay('rotation', parseFloat((e.target as HTMLInputElement).value) || 0)} /></label>
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
						<h3>Canvas (cm)</h3>
						<label>W (cm) <input type="number" step="0.1" value={+(canvasWidth / 118.11).toFixed(2)} oninput={(e) => canvasWidth = Math.round(parseFloat((e.target as HTMLInputElement).value) * 118.11) || canvasWidth} min="0.1" /></label>
						<label>H (cm) <input type="number" step="0.1" value={+(canvasHeight / 118.11).toFixed(2)} oninput={(e) => canvasHeight = Math.round(parseFloat((e.target as HTMLInputElement).value) * 118.11) || canvasHeight} min="0.1" /></label>
					</div>
					<div class="sidebar-section">
						<h3>Background</h3>
						<label>Rotasi <input type="number" bind:value={bgRotation} /></label>
						<label>X (cm) <input type="number" step="0.1" value={+(bgOffsetX / 118.11).toFixed(2)} oninput={(e) => bgOffsetX = Math.round(parseFloat((e.target as HTMLInputElement).value) * 118.11) || 0} /></label>
						<label>Y (cm) <input type="number" step="0.1" value={+(bgOffsetY / 118.11).toFixed(2)} oninput={(e) => bgOffsetY = Math.round(parseFloat((e.target as HTMLInputElement).value) * 118.11) || 0} /></label>
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

<style lang="scss">
	@use "../../../styles/variables" as *;
	.editor-page {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		background: $color-bg;
	}
	.topbar {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.65rem 1.25rem;
		background: rgba(30, 41, 59, 0.85);
		backdrop-filter: blur(24px) saturate(180%);
		-webkit-backdrop-filter: blur(24px) saturate(180%);
		border-bottom: 1px solid rgba(255, 255, 255, 0.08);
	}
	.back-btn {
		padding: 0.45rem 0.9rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 10px;
		background: rgba(255, 255, 255, 0.08);
		color: #ffffff;
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s $ease-apple;
	}
	.back-btn:hover {
		background: rgba(255, 255, 255, 0.16);
		transform: scale(1.02);
	}
	.back-btn:active {
		transform: scale(0.95);
	}
	.name-input {
		color: #ffffff;
		background: rgba(255, 255, 255, 0.06);
		flex: 1;
		padding: 0.5rem 0.85rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 10px;
		font-size: 0.95rem;
		font-weight: 600;
		outline: none;
		transition: all 0.2s $ease-apple;
	}
	.name-input:focus {
		border-color: $color-primary;
		background: rgba(255, 255, 255, 0.09);
		box-shadow: 0 0 0 3px rgba(10, 132, 255, 0.25);
	}
	.save-btn {
		padding: 0.5rem 1.6rem;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 10px;
		background: $color-primary;
		color: #ffffff;
		font-weight: 600;
		font-size: 0.9rem;
		letter-spacing: -0.01em;
		cursor: pointer;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 2px 10px rgba(10, 132, 255, 0.35);
		transition: all 0.2s $ease-apple;
	}
	.save-btn:hover:not(:disabled) {
		background: $color-primary-hover;
		transform: scale(1.02);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 4px 14px rgba(10, 132, 255, 0.45);
	}
	.save-btn:active:not(:disabled) {
		transform: scale(0.95);
	}
	.save-btn:disabled { opacity: 0.35; cursor: not-allowed; }
	.editor-body {
		flex: 1;
		display: flex;
		overflow: hidden;
	}
	.toolbar {
		display: flex;
		flex-direction: column;
		gap: 0.45rem;
		padding: 0.75rem 0.6rem;
		background: rgba(30, 41, 59, 0.85);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border-right: 1px solid rgba(255, 255, 255, 0.08);
		width: 104px;
		flex-shrink: 0;
	}
	.tool-btn {
		color: #ffffff;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.25rem;
		padding: 0.55rem 0.35rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.04);
		font-size: 0.72rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.18s $ease-apple;
		user-select: none;
	}
	.tool-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.1);
		border-color: rgba(255, 255, 255, 0.18);
		transform: scale(1.03);
	}
	.tool-btn:active:not(:disabled) {
		transform: scale(0.94);
	}
	.tool-btn:disabled { opacity: 0.35; cursor: not-allowed; }
	.tool-btn.danger:hover {
		background: rgba(255, 69, 58, 0.18);
		border-color: rgba(255, 69, 58, 0.4);
		color: #ff6961;
	}
	.sidebar-action-btn {
		background: rgba(255, 255, 255, 0.06);
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 10px;
		font-size: 0.85rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.18s $ease-apple;
	}
	.sidebar-action-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.2);
		transform: scale(1.02);
	}
	.sidebar-action-btn:active:not(:disabled) {
		transform: scale(0.95);
	}
	.sidebar-action-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
	}
	.layer-section {
		margin-top: 1rem;
		padding-top: 0.75rem;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
	}
	.layer-title {
		font-size: 0.75rem;
		font-weight: 600;
		color: $color-text-muted;
		margin-bottom: 0.5rem;
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.layer-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}
	.layer-btn {
		background: rgba(255, 255, 255, 0.05);
		color: #ffffff;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.3rem;
		padding: 0.45rem 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 8px;
		font-size: 0.75rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.15s $ease-apple;
	}
	.layer-btn:hover:not(:disabled) {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.2);
		transform: scale(1.02);
	}
	.layer-btn:active:not(:disabled) {
		transform: scale(0.95);
	}
	.layer-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
		background: rgba(255, 255, 255, 0.02);
		border-color: rgba(255, 255, 255, 0.04);
		color: $color-text-muted;
	}
	.overlay-badge {
		position: absolute;
		top: -24px;
		left: 50%;
		transform: translateX(-50%);
		background: $color-primary;
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
		0% { outline: 3px solid $color-primary-hover; outline-offset: 2px; box-shadow: 0 0 12px rgba(99, 102, 241, 0.8); }
		50% { outline: 4px solid $color-primary-hover; outline-offset: 4px; box-shadow: 0 0 20px rgba(99, 102, 241, 0.9); }
		100% { outline: 2px solid $color-primary; outline-offset: 0px; box-shadow: none; }
	}
	.preset-section {
		margin-top: 1.25rem;
		padding-top: 0.75rem;
		border-top: 1px solid $color-border;
	}
	.preset-list {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		margin-bottom: 0.6rem;
	}
	.preset-item {
				background: $color-surface;
display: flex;
		align-items: center;
		border: 1px solid $color-border;
		border-radius: 6px;
		background: $color-surface;
		overflow: hidden;
		transition: border-color 0.1s;
	}
	.preset-item:hover {
		border-color: rgba(255,255,255,0.2);
	}
	.preset-apply-btn {
				color: $color-text;
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
		background: rgba(255, 255, 255, 0.02);
	}
	.preset-title {
		font-weight: 600;
		color: $color-text;
	}
	.preset-dim {
		font-size: 0.7rem;
		color: $color-text-muted;
	}
	.preset-del-btn {
		padding: 0.4rem 0.55rem;
		border: none;
		background: transparent;
		color: $color-text-muted;
		font-size: 1.1rem;
		line-height: 1;
		cursor: pointer;
	}
	.preset-del-btn:hover {
		color: $color-danger-hover;
		background: rgba($color-danger, 0.1);
	}
	.add-preset-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.5rem;
		border: 1px dashed rgba(255,255,255,0.2);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.02);
		font-size: 0.8rem;
		font-weight: 600;
		color: $color-primary;
		cursor: pointer;
		transition: all 0.1s;
	}
	.add-preset-btn:hover:not(:disabled) {
		border-color: $color-primary;
		background: rgba(10, 132, 255, 0.15);
	}
	.add-preset-btn:active:not(:disabled) {
		transform: scale(0.96);
	}
	.add-preset-btn:disabled {
		opacity: 0.35;
		cursor: not-allowed;
		border-style: solid;
	}
	.tool-btn.active {
		background: rgba(10, 132, 255, 0.22);
		border-color: $color-primary;
		color: #ffffff;
		box-shadow: 0 0 12px rgba(10, 132, 255, 0.3);
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
		background: $color-bg;
		overflow: hidden;
		position: relative;
		touch-action: none;
	}
	.canvas-empty {
		text-align: center;
		color: $color-text-muted;
	}
	.canvas-empty p { margin: 0.5rem 0 0; }
	.canvas-inner {
		position: relative;
		transform-origin: center center;
		box-shadow: 0 4px 20px rgba(0,0,0,0.4);
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
		border-color: $color-primary;
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
		outline: 2px solid $color-primary;
		outline-offset: 2px;
	}
	.resize-handle {
		position: absolute;
		width: 34px;
		height: 34px;
		background: $color-primary;
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
	.resize-handle.nw { top: -17px; left: -17px; cursor: nw-resize; }
	.resize-handle.ne { top: -17px; right: -17px; cursor: ne-resize; }
	.resize-handle.sw { bottom: -17px; left: -17px; cursor: sw-resize; }
	.resize-handle.se { bottom: -17px; right: -17px; cursor: se-resize; }
	.resize-handle.n { top: -17px; left: 50%; margin-left: -17px; cursor: n-resize; }
	.resize-handle.s { bottom: -17px; left: 50%; margin-left: -17px; cursor: s-resize; }
	.resize-handle.e { right: -17px; top: 50%; margin-top: -17px; cursor: e-resize; }
	.resize-handle.w { left: -17px; top: 50%; margin-top: -17px; cursor: w-resize; }

	.canvas-resize-handle {
		position: absolute;
		width: 10px;
		height: 10px;
		background: $color-primary;
		border: 1px solid #fff;
		border-radius: 2px;
		z-index: 10;
		cursor: pointer;
	}
	.canvas-resize-handle.nw { top: -5px; left: -5px; cursor: nw-resize; }
	.canvas-resize-handle.ne { top: -5px; right: -5px; cursor: ne-resize; }
	.canvas-resize-handle.sw { bottom: -5px; left: -5px; cursor: sw-resize; }
	.canvas-resize-handle.se { bottom: -5px; right: -5px; cursor: se-resize; }
	.canvas-resize-handle.n { top: -5px; left: 50%; margin-left: -5px; cursor: n-resize; }
	.canvas-resize-handle.s { bottom: -5px; left: 50%; margin-left: -5px; cursor: s-resize; }
	.canvas-resize-handle.e { right: -5px; top: 50%; margin-top: -5px; cursor: e-resize; }
	.canvas-resize-handle.w { left: -5px; top: 50%; margin-top: -5px; cursor: w-resize; }
	.sidebar {
		width: 190px;
		padding: 0.9rem;
		background: rgba(30, 41, 59, 0.85);
		backdrop-filter: blur(24px);
		-webkit-backdrop-filter: blur(24px);
		border-left: 1px solid rgba(255, 255, 255, 0.08);
		overflow-y: auto;
		flex-shrink: 0;
	}
	.sidebar-section h3 {
		margin: 0 0 0.6rem;
		font-size: 0.85rem;
		font-weight: 600;
		letter-spacing: -0.01em;
	}
	.sidebar-section label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		margin-bottom: 0.4rem;
		font-size: 0.78rem;
		color: $color-text-muted;
	}
	.sidebar-section label input {
		background: rgba(255, 255, 255, 0.06);
		color: #ffffff;
		width: 72px;
		padding: 0.3rem 0.5rem;
		border: 1px solid rgba(255, 255, 255, 0.1);
		border-radius: 8px;
		font-size: 0.78rem;
		outline: none;
		transition: all 0.15s $ease-apple;
	}
	.sidebar-section label input:focus {
		border-color: $color-primary;
		background: rgba(255, 255, 255, 0.1);
	}
	.sidebar-empty {
		font-size: 0.8rem;
		color: $color-text-muted;
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
		color: $color-text;
	}
	.sidebar-link {
		font-size: 0.75rem;
		font-weight: 600;
		background: none;
		border: none;
		cursor: pointer;
		padding: 0;
		color: $color-text-muted;
		transition: color 0.15s;
	}
	.sidebar-link:hover { color: #ffffff; }
	.sidebar-link.danger:hover { color: $color-danger; }
	.confirm-pop {
		margin-top: 0.6rem;
		padding: 0.6rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.05);
		font-size: 0.78rem;
		color: $color-text;
		display: flex;
		align-items: center;
		gap: 0.4rem;
		flex-wrap: wrap;
		animation: confirm-in 0.18s $ease-spring;
	}
	.confirm-btn {
		color: #ffffff;
		padding: 0.3rem 0.7rem;
		border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 8px;
		background: rgba(255, 255, 255, 0.08);
		font-size: 0.73rem;
		font-weight: 600;
		cursor: pointer;
		transition: all 0.15s $ease-apple;
	}
	.confirm-btn:hover { background: rgba(255, 255, 255, 0.16); transform: scale(1.02); }
	.confirm-btn:active { transform: scale(0.95); }
	.confirm-btn.ya {
		background: $color-danger;
		border-color: rgba(255, 255, 255, 0.2);
		color: #fff;
	}
	.confirm-btn.ya:hover { opacity: 0.9; }
	@keyframes confirm-in {
		from { opacity: 0; transform: translateY(4px); }
		to { opacity: 1; transform: translateY(0); }
	}

	.modal-overlay {
		position: fixed; top: 0; left: 0; right: 0; bottom: 0;
		background: rgba(15, 23, 42, 0.8);
		display: flex; align-items: center; justify-content: center;
		z-index: 1000;
		backdrop-filter: blur(8px);
	}
	.modal-content {
		background: rgba(30, 41, 59, 0.95);
		border: 1px solid rgba(255, 255, 255, 0.1);
		padding: 2.5rem; border-radius: 20px; width: 440px;
		text-align: center; color: #fff;
		box-shadow: 0 20px 40px rgba(0,0,0,0.5);
	}
	.modal-content h2 { margin-top: 0; margin-bottom: 0.5rem; font-size: 1.5rem; font-weight: 700; }
	.modal-content p { color: $color-text-muted; margin-bottom: 2rem; font-size: 0.95rem; }
	.modal-options { display: flex; flex-direction: column; gap: 0.85rem; }
	.modal-options button {
		background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.1);
		padding: 1rem; border-radius: 12px; color: #fff;
		cursor: pointer; transition: all 0.2s;
		display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
	}
	.modal-options button:hover { background: rgba(10, 132, 255, 0.2); border-color: $color-primary; transform: translateY(-2px); }
	.modal-options button:active { transform: translateY(0); }
	.modal-options button.outline { background: transparent; border-style: dashed; }
	.modal-options button.outline:hover { background: rgba(255, 255, 255, 0.05); border-color: rgba(255, 255, 255, 0.3); }
	.paper-name { font-weight: 600; font-size: 1.15rem; }
	.paper-dim { font-size: 0.85rem; color: $color-text-muted; }
</style>
