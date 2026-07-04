<script lang="ts">
	import { onMount } from 'svelte';
	import type { CapturedPhoto } from '$lib/stores/shoot.svelte';

	let {
		template,
		photos
	}: {
		template: any;
		photos: CapturedPhoto[];
	} = $props();

	let canvasEl = $state<HTMLCanvasElement | undefined>(undefined);
	let compositedUrl = $state<string | undefined>(undefined);

	onMount(() => {
		composite();
	});

	function drawImageCover(
		ctx: CanvasRenderingContext2D,
		img: HTMLImageElement,
		dx: number, dy: number, dw: number, dh: number
	) {
		const scale = Math.max(dw / img.naturalWidth, dh / img.naturalHeight);
		const sw = img.naturalWidth * scale;
		const sh = img.naturalHeight * scale;
		const ox = dx + (dw - sw) / 2;
		const oy = dy + (dh - sh) / 2;
		ctx.drawImage(img, ox, oy, sw, sh);
	}

	async function composite() {
		if (!canvasEl) return;

		canvasEl.width = template.canvas_width;
		canvasEl.height = template.canvas_height;
		const ctx = canvasEl.getContext('2d')!;
		ctx.clearRect(0, 0, template.canvas_width, template.canvas_height);

		const layers: { draw: () => Promise<void> }[] = [];

		if (template.background_path) {
			layers.push({
				draw: async () => {
					const bg = new Image();
					bg.crossOrigin = 'anonymous';
					bg.src = template.background_path;
					await bg.decode();
					drawImageCover(ctx, bg, 0, 0, template.canvas_width, template.canvas_height);
				}
			});
		}

		const slots: { x: number; y: number; width: number; height: number }[] = template.slots || [];
		for (let i = 0; i < slots.length; i++) {
			const slot = slots[i];
			const photo = photos[i];
			if (!photo) continue;

			layers.push({
				draw: async () => {
					const p = new Image();
					p.src = photo.data;
					await p.decode();
					drawImageCover(ctx, p, slot.x, slot.y, slot.width, slot.height);
				}
			});
		}

		const overlays: { src: string; x: number; y: number; width: number; height: number; rotation: number }[] = template.overlays || [];
		for (const ov of overlays) {
			layers.push({
				draw: async () => {
					const img = new Image();
					img.crossOrigin = 'anonymous';
					img.src = ov.src;
					await img.decode();
					ctx.save();
					const cx = ov.x + ov.width / 2;
					const cy = ov.y + ov.height / 2;
					ctx.translate(cx, cy);
					ctx.rotate((ov.rotation * Math.PI) / 180);
					ctx.translate(-cx, -cy);
					drawImageCover(ctx, img, ov.x, ov.y, ov.width, ov.height);
					ctx.restore();
				}
			});
		}

		for (const layer of layers) {
			await layer.draw();
		}

		compositedUrl = canvasEl.toDataURL('image/png');
	}
</script>

{#if compositedUrl}
	<div class="print">
		<img src={compositedUrl} alt="Hasil komposit" class="result" />
	</div>
{:else}
	<canvas bind:this={canvasEl} style="display:none"></canvas>
	<div class="loading">Memproses...</div>
{/if}

<style>
	.print {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.result {
		display: block;
		width: 350px;
		max-height: 100%;
		height: auto;
		border-radius: 4px;
		box-shadow: 0 4px 20px rgba(0,0,0,0.12);
	}
	.loading {
		text-align: center;
		color: #9ca3af;
		padding: 2rem;
	}
</style>
