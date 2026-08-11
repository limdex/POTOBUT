<script lang="ts">
	import type { TemplateRecord, Slot, Overlay } from '$lib/data/admin-types';

	let { template }: { template: TemplateRecord } = $props();

	// Parse JSON safely
	let parsedSlots: Slot[] = $derived.by(() => {
		try {
			if (!template.slots) return [];
			if (typeof template.slots !== 'string') return template.slots;
			return JSON.parse(template.slots);
		} catch (e) {
			return [];
		}
	});

	let parsedOverlays: Overlay[] = $derived.by(() => {
		try {
			if (!template.overlays) return [];
			if (typeof template.overlays !== 'string') return template.overlays;
			return JSON.parse(template.overlays);
		} catch (e) {
			return [];
		}
	});

	let cw = $derived(template.canvas_width || 1200);
	let ch = $derived(template.canvas_height || 1800);
</script>

<div class="template-preview" style="aspect-ratio: {cw} / {ch};">
	{#if template.background_path}
		<img class="bg" src={template.background_path} alt={template.name} />
	{/if}

	{#each parsedSlots as slot, i}
		<div
			class="slot-preview"
			style="left: {(slot.x / cw) * 100}%; top: {(slot.y / ch) * 100}%; width: {(slot.width / cw) * 100}%; height: {(slot.height / ch) * 100}%;"
		>
			<div class="slot-placeholder">
				<svg width="40%" height="40%" viewBox="0 0 100 100" fill="rgba(255,255,255,0.4)">
					<circle cx="50" cy="35" r="18" />
					<ellipse cx="50" cy="75" rx="30" ry="25" />
				</svg>
			</div>
			<div class="slot-num">{i + 1}</div>
		</div>
	{/each}

	{#each parsedOverlays as ov}
		<img
			class="overlay-preview"
			src={ov.src}
			alt="Overlay"
			style="left: {(ov.x / cw) * 100}%; top: {(ov.y / ch) * 100}%; width: {(ov.width / cw) * 100}%; height: {(ov.height / ch) * 100}%; transform: rotate({ov.rotation}deg);"
		/>
	{/each}
</div>

<style>
	.template-preview {
		position: relative;
		width: 100%;
		height: auto;
		background: #e2e8f0; /* fallback canvas bg */
		overflow: hidden;
	}

	.bg {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		object-fit: cover; /* match backgroundSize: cover logic roughly */
		z-index: 0;
	}

	.slot-preview {
		position: absolute;
		background: rgba(148, 163, 184, 0.25);
		border: 1px dashed rgba(255, 255, 255, 0.4);
		z-index: 1;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		overflow: hidden;
	}

	.slot-placeholder {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.slot-num {
		position: absolute;
		bottom: 4px;
		right: 6px;
		font-size: 0.75rem;
		font-weight: 700;
		color: rgba(255, 255, 255, 0.7);
		text-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
		line-height: 1;
	}

	.overlay-preview {
		position: absolute;
		object-fit: contain;
		z-index: 2;
		/* rotation origin defaults to 50% 50% which is correct */
	}
</style>
