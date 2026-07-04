<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { shootState } from '$lib/stores/shoot.svelte';
	import PhotoLayout from '$lib/components/PhotoLayout.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const template = data.template;
	let mencetak = $state(false);
	let printerConnected = $state(false);
	let printerStatusLoaded = $state(false);

	async function cetak() {
		if (!template) return;
		console.log('[CETAK] Starting print process...');
		mencetak = true;
		try {
			console.log('[CETAK] Generating composite image...');
			const res = await fetch('/api/generate', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					templateId: template.id,
					photos: shootState.capturedPhotos.map(p => ({ data: p.data }))
				})
			});
			if (!res.ok) throw new Error('Gagal generate');
			const blob = await res.blob();
			console.log('[CETAK] Image generated, size:', blob.size, 'bytes');

			if (printerConnected) {
				console.log('[CETAK] Printer connected, sending to print...');
				const reader = new FileReader();
				const dataUrl = await new Promise<string>((resolve) => {
					reader.onload = () => resolve(reader.result as string);
					reader.readAsDataURL(blob);
				});
				const printRes = await fetch('/api/print', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ image: dataUrl })
				});
				const printResult = await printRes.json();
				console.log('[CETAK] Print result:', printResult);
				if (!printResult.ok) {
					alert('Gagal mencetak: ' + (printResult.error || 'Unknown error'));
				} else {
					console.log('[CETAK] Print successful!');
				}
			} else {
				console.log('[CETAK] No printer, downloading as file...');
				const url = URL.createObjectURL(blob);
				const a = document.createElement('a');
				a.href = url;
				a.download = 'potobut-result.png';
				a.click();
				URL.revokeObjectURL(url);
			}
		} catch (e) {
			console.error('[CETAK] Error:', e);
			alert('Gagal: ' + (e as Error).message);
		} finally {
			mencetak = false;
		}
	}

	onMount(async () => {
		console.log('[CETAK] Checking printer status...');
		const res = await fetch('/api/printer');
		const status = await res.json();
		console.log('[CETAK] Printer status:', status);
		printerConnected = status.connected;
		printerStatusLoaded = true;
	});
</script>

<svelte:head>
	<title>Hasil Foto — potobut</title>
</svelte:head>

<div class="page">
	<div class="top-actions">
		<button class="btn" onclick={() => { shootState.reset(); goto('/templates'); }}>Ulangi</button>
		<button class="btn" onclick={cetak} disabled={mencetak}>{mencetak ? 'Memproses...' : 'Cetak'}</button>
	</div>

	<div class="photo-wrap">
		{#if template}
			<PhotoLayout {template} photos={shootState.capturedPhotos} />
		{/if}
	</div>
</div>

<style>
	.page {
		max-width: 1000px;
		margin: 0 auto;
		height: 100dvh;
		display: flex;
		flex-direction: column;
		box-sizing: border-box;
		position: relative;
	}
	.top-actions {
		position: absolute;
		top: 1rem;
		right: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		z-index: 10;
	}
	.photo-wrap {
		flex: 1;
		min-height: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		overflow: hidden;
		width: 100%;
	}
	.btn {
		padding: 0.5rem 1.2rem;
		font-size: 0.85rem;
		font-weight: 600;
		border: none;
		border-radius: 8px;
		background: #4f46e5;
		color: #fff;
		cursor: pointer;
	}
	.btn:hover { opacity: 0.9; }
</style>
