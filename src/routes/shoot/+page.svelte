<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { shootState } from '$lib/stores/shoot.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const template = data.template;

	let countdown = $state(5);
	let currentShot = $state(0);
	let phase = $state<'ready' | 'countdown' | 'done'>('ready');
	let flash = $state(false);

	const totalShots = $derived(template?.slot_count ?? 1);

	function generatePlaceholder(): string {
		const canvas = document.createElement('canvas');
		canvas.width = 320;
		canvas.height = 240;
		const ctx = canvas.getContext('2d')!;
		ctx.fillStyle = '#000';
		ctx.fillRect(0, 0, 320, 240);
		return canvas.toDataURL();
	}

	let timerId: ReturnType<typeof setTimeout> | undefined;
	let cameraConnected = $state(false);
	let previewSrc = $state<string | null>(null);
	let previewTimer: ReturnType<typeof setInterval> | undefined;

	async function refreshPreview() {
		try {
			const res = await fetch(`/api/camera/preview?t=${Date.now()}`, { cache: 'no-store' });
			if (!res.ok) return;
			const blob = await res.blob();
			if (previewSrc) URL.revokeObjectURL(previewSrc);
			previewSrc = URL.createObjectURL(blob);
		} catch {
			// ignore
		}
	}

	function startCountdown() {
		phase = 'countdown';
		countdown = 5;
		timerId = setTimeout(tick, 1000);
	}

	function tick() {
		if (phase !== 'countdown') return;
		if (countdown <= 1) {
			countdown = 0;
			capture();
			return;
		}
		countdown--;
		timerId = setTimeout(tick, 1000);
	}

	async function capture() {
		flash = true;
		let data: string;
		if (cameraConnected) {
			console.log('[SHOOT] Capturing photo from camera...');
			const res = await fetch('/api/camera/capture', { method: 'POST' });
			if (res.ok) {
				const blob = await res.blob();
				console.log('[SHOOT] Capture success, blob size:', blob.size, 'bytes');
				data = await new Promise<string>((resolve) => {
					const reader = new FileReader();
					reader.onload = () => resolve(reader.result as string);
					reader.readAsDataURL(blob);
				});
			} else {
				console.log('[SHOOT] Capture failed, using placeholder');
				data = generatePlaceholder();
			}
		} else {
			console.log('[SHOOT] Camera not connected, using placeholder');
			data = generatePlaceholder();
		}
		shootState.addPhoto(data);
		console.log('[SHOOT] Photo added, total:', shootState.capturedPhotos.length);
		setTimeout(() => {
			flash = false;
			if (currentShot < totalShots - 1) {
				currentShot++;
				countdown = 5;
				timerId = setTimeout(tick, 1000);
			} else {
				phase = 'done';
				timerId = undefined;
			}
		}, 400);
	}

	onMount(() => {
		console.log('[SHOOT] Checking camera status...');
		fetch('/api/camera').then(r => r.json()).then(status => {
			console.log('[SHOOT] Camera status:', status);
			cameraConnected = status.connected;
			if (status.connected) {
				console.log('[SHOOT] Starting live preview');
				refreshPreview();
				previewTimer = setInterval(refreshPreview, 2000);
			} else {
				console.log('[SHOOT] Camera not connected, using placeholders');
			}
		}).catch(err => {
			console.error('[SHOOT] Error checking camera:', err);
		});
	});

	onDestroy(() => {
		if (timerId) clearTimeout(timerId);
		if (previewTimer) clearInterval(previewTimer);
		if (previewSrc) URL.revokeObjectURL(previewSrc);
	});
</script>

<svelte:head>
	<title>Memotret — potobut</title>
</svelte:head>

<div class="page">
	<div class="viewfinder">
		{#if cameraConnected && previewSrc}
			<img src={previewSrc} class="camera-bg" alt="" />
		{/if}
		{#if flash}
			<div class="flash-overlay"></div>
		{/if}

		{#if phase === 'ready'}
			<div class="viewfinder-content">
				<p class="shot-label">Siap?</p>
				<button class="btn" onclick={startCountdown}>Mulai</button>
			</div>
		{:else if phase === 'countdown'}
			<div class="viewfinder-content">
				<div class="shot-info">Potret {currentShot + 1} / {template?.slot_count}</div>
				<div class="countdown-ring">
					<svg viewBox="0 0 120 120">
						<circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="6" />
						<circle
							cx="60" cy="60" r="52"
							fill="none" stroke="#fff" stroke-width="6"
							stroke-linecap="round"
							stroke-dasharray="326.73"
							stroke-dashoffset={326.73 * (1 - countdown / 5)}
							transform="rotate(-90 60 60)"
						/>
					</svg>
					<span class="countdown-num">{countdown}</span>
				</div>
			</div>
		{:else if phase === 'done'}
			<div class="viewfinder-content">
				<p class="shot-label">Selesai!</p>
				<button class="btn" onclick={() => goto(`/review?template=${template?.id}`)}>Lihat Hasil</button>
			</div>
		{/if}

		<div class="strip">
			{#each shootState.capturedPhotos as photo (photo.id)}
				<img src={photo.data} alt="Shot {photo.id}" class="thumb" />
			{/each}
			{#each Array((template?.slot_count ?? 0) - shootState.capturedPhotos.length) as _, i}
				<div class="thumb empty"></div>
			{/each}
		</div>
	</div>
</div>

<style>
	.page {
		display: flex;
		flex-direction: column;
		min-height: 100dvh;
	}
	.viewfinder {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #1f2937;
		position: relative;
		overflow: hidden;
		min-height: 0;
	}
	.camera-bg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.flash-overlay {
		position: absolute;
		inset: 0;
		background: #fff;
		animation: flash 0.4s ease-out;
		z-index: 10;
	}
	@keyframes flash {
		0% { opacity: 1; }
		100% { opacity: 0; }
	}
	.viewfinder-content {
		text-align: center;
		color: #fff;
	}
	.shot-info {
		font-size: 1.1rem;
		color: rgba(255,255,255,0.6);
		margin-bottom: 1.5rem;
	}
	.shot-label {
		font-size: 2rem;
		font-weight: 700;
		margin: 0 0 1.5rem;
	}
	.countdown-ring {
		position: relative;
		width: 140px;
		height: 140px;
		margin: 0 auto;
	}
	.countdown-ring svg {
		position: absolute;
		inset: 0;
	}
	.countdown-num {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 3.5rem;
		font-weight: 800;
	}
	.btn {
		padding: 0.85rem 2.5rem;
		font-size: 1.1rem;
		font-weight: 600;
		border: none;
		border-radius: 12px;
		background: #4f46e5;
		color: #fff;
		cursor: pointer;
	}
	.btn:hover { opacity: 0.9; }
	.strip {
		position: absolute;
		bottom: 0;
		left: 0;
		right: 0;
		display: flex;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem;
		overflow-x: auto;
		pointer-events: none;
	}
	.thumb {
		width: 160px;
		height: 120px;
		border-radius: 8px;
		object-fit: cover;
		flex-shrink: 0;
		pointer-events: auto;
	}
	.thumb.empty {
		background: rgba(55, 65, 81, 0.5);
	}
</style>
