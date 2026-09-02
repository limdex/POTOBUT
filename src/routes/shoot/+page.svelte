<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { goto } from '$app/navigation';
	import { shootState } from '$lib/stores/shoot.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let countdown = $state(5);
	let maxCountdown = $state(5);
	let currentShot = $state(0);
	let phase = $state<'ready' | 'countdown' | 'done'>('ready');
	let flash = $state(false);

	const totalShots = $derived(data.template?.slot_count ?? 1);

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

	function startCountdown(seconds: number = 5) {
		if (typeof seconds !== 'number') seconds = 5;
		phase = 'countdown';
		countdown = seconds;
		maxCountdown = seconds;
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
		let photoData: string;
		if (cameraConnected) {
			const res = await fetch('/api/camera/capture', { method: 'POST' });
			if (res.ok) {
				const blob = await res.blob();
				photoData = await new Promise<string>((resolve) => {
					const reader = new FileReader();
					reader.onload = () => resolve(reader.result as string);
					reader.readAsDataURL(blob);
				});
			} else {
				photoData = generatePlaceholder();
			}
		} else {
			photoData = generatePlaceholder();
		}
		shootState.addPhoto(photoData);
		setTimeout(() => {
			flash = false;
			currentShot++;
			if (currentShot >= totalShots) {
				phase = 'done';
				timerId = undefined;
			} else {
				startCountdown(10);
			}
		}, 200);
	}

	onMount(() => {
		fetch('/api/camera').then(r => r.json()).then(status => {
			cameraConnected = status.connected;
		}).catch(() => {});
	});

	onDestroy(() => {
		if (timerId) clearTimeout(timerId);
	});

	function handleKeydown(e: KeyboardEvent) {
		if (e.code === 'Space' && phase === 'ready') {
			e.preventDefault();
			startCountdown(5);
		}
	}
</script>

<svelte:window onkeydown={handleKeydown} />

<svelte:head>
	<title>Memotret — potobut</title>
</svelte:head>

<div class="page">
	<div class="viewfinder">
		{#if cameraConnected}
			<img src="/api/camera/live-feed" class="camera-bg" alt="" />
		{/if}
		{#if flash}
			<div class="flash-overlay"></div>
		{/if}

		{#if phase === 'ready'}
			<div class="viewfinder-content">
				<p class="shot-label">Potret {currentShot + 1} / {data.template?.slot_count}</p>
				<button class="btn" onclick={() => startCountdown(5)}>Mulai</button>
			</div>
		{:else if phase === 'countdown'}
			<div class="viewfinder-content">
				<div class="shot-info">Potret {currentShot + 1} / {data.template?.slot_count}</div>
				<div class="countdown-ring">
					<svg viewBox="0 0 120 120">
						<circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="6" />
						<circle
							cx="60" cy="60" r="52"
							fill="none" stroke="#fff" stroke-width="6"
							stroke-linecap="round"
							stroke-dasharray="326.73"
							stroke-dashoffset={326.73 * (1 - countdown / maxCountdown)}
							transform="rotate(-90 60 60)"
						/>
					</svg>
					<span class="countdown-num">{countdown}</span>
				</div>
			</div>
		{:else if phase === 'done'}
			<div class="viewfinder-content">
				<p class="shot-label">Selesai!</p>
				<button class="btn" onclick={() => goto(`/review?template=${data.template?.id}`)}>Lihat Hasil</button>
			</div>
		{/if}
	</div>

	<div class="strip">
		{#each shootState.capturedPhotos as photo (photo.id)}
			<img src={photo.data} alt="Shot {photo.id}" class="thumb" />
		{/each}
		{#each Array((data.template?.slot_count ?? 0) - shootState.capturedPhotos.length) as _, i}
			<div class="thumb empty"></div>
		{/each}
	</div>
</div>

<style lang="scss">
	@use '../../styles/variables' as *;

	.page {
		display: flex;
		flex-direction: column;
		height: 100dvh;
		padding: 1.5rem;
		background: $color-bg;
		position: relative;
		overflow: hidden;
	}
	.viewfinder {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		background: $color-surface;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 24px;
		position: relative;
		overflow: hidden;
		min-height: 0;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08), 0 12px 36px rgba(0, 0, 0, 0.6);
	}
	.camera-bg {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: 0;
	}
	.flash-overlay {
		position: absolute;
		inset: 0;
		background: #ffffff;
		animation: flash 0.2s ease-out;
		z-index: 10;
	}
	@keyframes flash {
		0% { opacity: 1; }
		100% { opacity: 0; }
	}
	.viewfinder-content {
		position: relative;
		z-index: 1;
		text-align: center;
		color: #ffffff;
	}
	.shot-info {
		font-size: 1rem;
		font-weight: 500;
		letter-spacing: -0.01em;
		color: $color-text-muted;
		margin-bottom: 1.5rem;
	}
	.shot-label {
		font-size: 2.25rem;
		font-weight: 700;
		letter-spacing: -0.025em;
		margin: 0 0 1.75rem;
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
		letter-spacing: -0.03em;
	}

	.strip {
		position: absolute;
		bottom: 16px;
		left: 16px;
		right: 16px;
		display: flex;
		justify-content: center;
		gap: 0.6rem;
		pointer-events: none;
	}
	.thumb {
		width: 110px;
		height: 82px;
		border-radius: 14px;
		object-fit: cover;
		pointer-events: auto;
		flex-shrink: 0;
		border: 1.5px solid rgba(255, 255, 255, 0.2);
		box-shadow: 0 8px 20px rgba(0, 0, 0, 0.5);
		transition: transform 0.2s $ease-apple;
	}
	.thumb:hover {
		transform: scale(1.05);
	}
	.thumb.empty {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(255, 255, 255, 0.08);
		backdrop-filter: blur(8px);
	}
</style>

