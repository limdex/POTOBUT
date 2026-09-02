<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { TemplateRecord } from '$lib/data/admin-types';
	import TemplatePreview from '$lib/components/TemplatePreview.svelte';

	let { data }: { data: { templates: TemplateRecord[] } } = $props();
	let templates = $state<TemplateRecord[]>([]);
	$effect(() => {
		templates = data.templates || [];
	});

	let showSettings = $state(false);
	let cameraStatus = $state<{ connected: boolean; model?: string; error?: string }>({ connected: false });
	let printerStatus = $state<{ connected: boolean; name?: string; available: string[]; error?: string }>({ connected: false, available: [] });
	let cameraLoading = $state(false);
	let printerLoading = $state(false);

	async function hapus(id: number) {
		if (!confirm('Hapus template ini?')) return;
		await fetch(`/api/templates/${id}`, { method: 'DELETE' });
		templates = templates.filter((t: TemplateRecord) => t.id !== id);
	}

	async function fetchCameraStatus() {
		console.log('[ADMIN] Fetching camera status...');
		const res = await fetch('/api/camera');
		cameraStatus = await res.json();
		console.log('[ADMIN] Camera status:', cameraStatus);
	}

	async function fetchPrinterStatus() {
		console.log('[ADMIN] Fetching printer status...');
		const res = await fetch('/api/printer');
		printerStatus = await res.json();
		console.log('[ADMIN] Printer status:', printerStatus);
	}

	async function connectCamera() {
		cameraLoading = true;
		console.log('[ADMIN] Connecting camera...');
		const res = await fetch('/api/camera', { method: 'POST' });
		cameraStatus = await res.json();
		console.log('[ADMIN] Camera connect result:', cameraStatus);
		cameraLoading = false;
	}

	async function disconnectCamera() {
		cameraLoading = true;
		console.log('[ADMIN] Disconnecting camera...');
		const res = await fetch('/api/camera', { method: 'DELETE' });
		cameraStatus = await res.json();
		console.log('[ADMIN] Camera disconnect result:', cameraStatus);
		cameraLoading = false;
	}

	async function connectPrinter() {
		printerLoading = true;
		console.log('[ADMIN] Connecting printer...');
		const res = await fetch('/api/printer', { method: 'POST' });
		printerStatus = await res.json();
		console.log('[ADMIN] Printer connect result:', printerStatus);
		printerLoading = false;
	}

	async function disconnectPrinter() {
		printerLoading = true;
		console.log('[ADMIN] Disconnecting printer...');
		const res = await fetch('/api/printer', { method: 'DELETE' });
		printerStatus = await res.json();
		console.log('[ADMIN] Printer disconnect result:', printerStatus);
		printerLoading = false;
	}

	onMount(() => {
		console.log('[ADMIN] Loading hardware status...');
		fetchCameraStatus();
		fetchPrinterStatus();
	});
</script>

<svelte:head>
	<title>Admin — potobut</title>
</svelte:head>

<div class="container">
	{#if templates.length === 0}
		<div class="empty-state">
			<div class="empty-icon">
				<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5-5 5"/></svg>
			</div>
			<h2>Belum ada template</h2>
			<p>Bikin dulu cok!</p>
			<button class="btn btn-md" onclick={() => goto('/admin/editor')}>Buat Template</button>
			<button class="btn btn-outline btn-md" onclick={() => goto('/templates')}>Buka Aplikasi</button>
			<button class="btn btn-outline btn-md btn-icon empty-gear" style="color: var(--color-text-muted, #8e8e93);" onclick={() => showSettings = true} aria-label="Pengaturan Hardware">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
			</button>
		</div>
	{:else}
		<div class="page-header is-flex">
			<h1>Template</h1>
			<button class="btn btn-md" onclick={() => goto('/admin/editor')}>Baru</button>
			<button class="btn btn-outline btn-md" onclick={() => goto('/templates')}>Buka Aplikasi</button>
			<button class="btn btn-outline btn-md btn-icon" style="color: var(--color-text-muted, #8e8e93);" onclick={() => showSettings = true} aria-label="Pengaturan Hardware">
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
			</button>
		</div>
		<div class="grid-responsive">
			{#each templates as tpl (tpl.id)}
				<div class="card" role="button" tabindex="0" onclick={() => goto(`/admin/editor?id=${tpl.id}`)} onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') goto(`/admin/editor?id=${tpl.id}`); }}>
					<div class="card-preview">
						<TemplatePreview template={tpl} />
					</div>
					<div class="card-info">
						<h3>{tpl.name}</h3>
						<span class="meta">{tpl.slot_count} slot · {tpl.canvas_width}×{tpl.canvas_height}</span>
					</div>
					<button class="delete-btn" onclick={(e) => { e.stopPropagation(); hapus(tpl.id); }}>Hapus</button>
				</div>
			{/each}
		</div>
	{/if}
</div>

{#if showSettings}
	<div class="settings-overlay" role="presentation" onclick={() => showSettings = false}>
		<div class="settings-panel" role="dialog" aria-modal="true" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
			<div class="settings-header">
				<h2>Pengaturan Hardware</h2>
				<button class="close-btn" onclick={() => showSettings = false} aria-label="Tutup Pengaturan">
					<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
				</button>
			</div>

			<div class="device-section">
				<div class="device-row">
					<div class="device-icon">
						<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3Z"/><circle cx="12" cy="13" r="3"/></svg>
					</div>
					<div class="device-info">
						<span class="device-label">Kamera</span>
						<span class="device-desc">
							{#if cameraLoading}
								Memeriksa...
							{:else if cameraStatus.connected}
								<span class="status-connected">Terhubung</span> — {cameraStatus.model || 'Canon'}
							{:else}
								<span class="status-disconnected">Terputus</span>
								{cameraStatus.error ? ` — ${cameraStatus.error}` : ''}
							{/if}
						</span>
					</div>
					<div class="device-action">
						{#if cameraStatus.connected}
							<button class="action-btn disconnect" onclick={disconnectCamera} disabled={cameraLoading}>Putuskan</button>
						{:else}
							<button class="action-btn connect" onclick={connectCamera} disabled={cameraLoading}>
								{cameraLoading ? '...' : 'Sambungkan'}
							</button>
						{/if}
					</div>
				</div>

				<div class="device-row">
					<div class="device-icon">
						<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 18H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2"/><path d="M6 18h12"/><path d="M9 22h6"/><path d="M12 18v4"/></svg>
					</div>
					<div class="device-info">
						<span class="device-label">Printer</span>
						<span class="device-desc">
							{#if printerLoading}
								Memeriksa...
							{:else if printerStatus.connected}
								<span class="status-connected">Terhubung</span> — {printerStatus.name}
							{:else}
								<span class="status-disconnected">Terputus</span>
								{printerStatus.error ? ` — ${printerStatus.error}` : ''}
							{/if}
						</span>
					</div>
					<div class="device-action">
						{#if printerStatus.connected}
							<button class="action-btn disconnect" onclick={disconnectPrinter} disabled={printerLoading}>Putuskan</button>
						{:else}
							<button class="action-btn connect" onclick={connectPrinter} disabled={printerLoading}>
								{printerLoading ? '...' : 'Sambungkan'}
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<style lang="scss">
	@use '../../styles/variables' as *;


	.empty-gear {
		margin: 1.5rem auto 0;
	}

	.meta {
		font-size: 0.82rem;
		color: $color-text-muted;
		letter-spacing: -0.01em;
	}
	.delete-btn {
		position: absolute;
		top: 0.6rem;
		right: 0.6rem;
		z-index: 10;
		background: rgba(255, 69, 58, 0.88);
		backdrop-filter: blur(8px);
		-webkit-backdrop-filter: blur(8px);
		color: #ffffff;
		border: 1px solid rgba(255, 255, 255, 0.2);
		border-radius: 8px;
		padding: 0.35rem 0.65rem;
		font-size: 0.75rem;
		font-weight: 600;
		cursor: pointer;
		opacity: 0;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		transition: all 0.18s $ease-apple;
	}
	.delete-btn:hover {
		background: $color-danger;
		transform: scale(1.05);
	}
	.delete-btn:active {
		transform: scale(0.92);
	}
	.card:hover .delete-btn {
		opacity: 1;
	}

	.settings-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(20px);
		-webkit-backdrop-filter: blur(20px);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
		animation: overlay-fade 0.2s $ease-apple;
	}
	@keyframes overlay-fade {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.settings-panel {
		background: rgba(30, 41, 59, 0.55);
		backdrop-filter: blur(40px) saturate(200%);
		-webkit-backdrop-filter: blur(40px) saturate(200%);
		border: 1px solid rgba(255, 255, 255, 0.18);
		border-radius: 24px;
		padding: 2rem;
		width: 480px;
		max-width: 90vw;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 20px 40px rgba(0, 0, 0, 0.5);
		color: $color-text;
		animation: panel-pop 0.25s $ease-spring;
	}
	@keyframes panel-pop {
		from { opacity: 0; transform: scale(0.94); }
		to { opacity: 1; transform: scale(1); }
	}

	.settings-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
	}
	.settings-header h2 {
		flex: 1;
		margin: 0;
		font-size: 1.25rem;
		font-weight: 700;
		letter-spacing: -0.02em;
	}
	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 30px;
		height: 30px;
		border: none;
		border-radius: 50%;
		background: rgba(255, 255, 255, 0.1);
		color: $color-text-muted;
		cursor: pointer;
		transition: all 0.18s $ease-apple;
	}
	.close-btn:hover {
		background: rgba(255, 255, 255, 0.2);
		color: #ffffff;
		transform: scale(1.05);
	}
	.close-btn:active {
		transform: scale(0.92);
	}

	.device-section {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}
	.device-row {
		display: flex;
		align-items: center;
		gap: 1rem;
		padding: 1rem;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 16px;
		background: rgba(255, 255, 255, 0.035);
		transition: all 0.2s $ease-apple;
	}
	.device-row:hover {
		background: rgba(255, 255, 255, 0.06);
		border-color: rgba(255, 255, 255, 0.14);
	}
	.device-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.08);
		color: #ffffff;
		flex-shrink: 0;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
	}
	.device-info {
		flex: 1;
		min-width: 0;
	}
	.device-label {
		display: block;
		font-weight: 600;
		font-size: 0.95rem;
		letter-spacing: -0.01em;
		margin-bottom: 0.15rem;
	}
	.device-desc {
		display: block;
		font-size: 0.82rem;
		color: $color-text-muted;
	}
	.status-connected {
		color: #30d158; // Apple iOS system green
		font-weight: 600;
	}
	.status-disconnected {
		color: $color-text-muted;
	}

	.action-btn {
		padding: 0.5rem 1.25rem;
		border-radius: 9999px;
		font-weight: 600;
		font-size: 0.85rem;
		letter-spacing: -0.01em;
		cursor: pointer;
		transition: all 0.2s $ease-apple;
		flex-shrink: 0;
		user-select: none;
	}
	.action-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}
	.action-btn.connect {
		background: $color-primary;
		border: 1px solid rgba(255, 255, 255, 0.2);
		color: #ffffff;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.3), 0 4px 14px rgba(10, 132, 255, 0.35);
	}
	.action-btn.connect:hover:not(:disabled) {
		background: $color-primary-hover;
		transform: scale(1.03);
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.4), 0 6px 18px rgba(10, 132, 255, 0.45);
	}
	.action-btn.connect:active:not(:disabled) {
		transform: scale(0.95);
	}
	.action-btn.disconnect {
		background: rgba(255, 69, 58, 0.18);
		border: 1px solid rgba(255, 69, 58, 0.4);
		color: #ff6961;
		box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.1);
	}
	.action-btn.disconnect:hover:not(:disabled) {
		background: rgba(255, 69, 58, 0.3);
		border-color: rgba(255, 69, 58, 0.6);
		transform: scale(1.03);
	}
	.action-btn.disconnect:active:not(:disabled) {
		transform: scale(0.95);
	}
</style>

