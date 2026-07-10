<script lang="ts">
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';

	let { data }: { data: { templates: any[] } } = $props();
	let templates = $state(data.templates || []);

	let showSettings = $state(false);
	let cameraStatus = $state<{ connected: boolean; model?: string; error?: string }>({ connected: false });
	let printerStatus = $state<{ connected: boolean; name?: string; available: string[]; error?: string }>({ connected: false, available: [] });
	let cameraLoading = $state(false);
	let printerLoading = $state(false);

	async function hapus(id: number) {
		if (!confirm('Hapus template ini?')) return;
		await fetch(`/api/templates/${id}`, { method: 'DELETE' });
		templates = templates.filter((t: any) => t.id !== id);
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

<div class="admin-page">
	{#if templates.length === 0}
		<div class="empty">
			<div class="empty-icon">
				<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5-5 5"/></svg>
			</div>
			<h2>Belum ada template</h2>
			<p>Bikin dulu cok!</p>
			<button class="btn" onclick={() => goto('/admin/editor')}>Buat Template</button>
			<button class="btn-outline" onclick={() => goto('/templates')}>Buka Aplikasi</button>
			<button class="gear-btn empty-gear" onclick={() => showSettings = true}>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
			</button>
		</div>
	{:else}
		<div class="header">
			<h1>Template</h1>
			<button class="btn" onclick={() => goto('/admin/editor')}>+ Baru</button>
			<button class="btn-outline" onclick={() => goto('/templates')}>Buka Aplikasi</button>
			<button class="gear-btn" onclick={() => showSettings = true}>
				<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"/></svg>
			</button>
		</div>
		<div class="grid">
			{#each templates as tpl (tpl.id)}
				<div class="card" onclick={() => goto(`/admin/editor?id=${tpl.id}`)}>
					<div class="card-preview">
						{#if tpl.background_path}
							<img src={tpl.background_path} alt={tpl.name} />
						{:else}
							<div class="no-bg">No BG</div>
						{/if}
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
	<div class="settings-overlay" onclick={() => showSettings = false}>
		<div class="settings-panel" onclick={(e) => e.stopPropagation()}>
			<div class="settings-header">
				<h2>Pengaturan Hardware</h2>
				<button class="close-btn" onclick={() => showSettings = false}>
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

<style>
	.admin-page {
		min-height: 100dvh;
		display: flex;
		flex-direction: column;
		align-items: center;
		padding: 2rem;
	}
	.empty {
		text-align: center;
	}
	.empty-icon {
		color: #6b7280;
		margin-bottom: 1rem;
	}
	.empty h2 {
		font-size: 1.3rem;
		margin: 0 0 0.3rem;
	}
	.empty p {
		color: #6b7280;
		margin: 0 0 1.5rem;
	}
	.header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 1.5rem;
		width: 100%;
		max-width: 800px;
	}
	.header h1 {
		flex: 1;
		margin: 0;
		font-size: 1.5rem;
	}
	.btn {
		padding: 0.75rem 2rem;
		border: none;
		border-radius: 10px;
		background: #4f46e5;
		color: #fff;
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		transition: opacity 0.15s;
	}
	.btn:hover { opacity: 0.85; }
	.btn-outline {
		padding: 0.75rem 2rem;
		border: 2px solid #4f46e5;
		border-radius: 10px;
		background: transparent;
		color: #4f46e5;
		font-weight: 600;
		font-size: 1rem;
		cursor: pointer;
		transition: background 0.15s, color 0.15s;
	}
	.btn-outline:hover {
		background: #4f46e5;
		color: #fff;
	}
	.gear-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 42px;
		height: 42px;
		border: 2px solid #e5e7eb;
		border-radius: 10px;
		background: #fff;
		color: #6b7280;
		cursor: pointer;
		transition: border-color 0.15s, color 0.15s;
	}
	.gear-btn:hover {
		border-color: #4f46e5;
		color: #4f46e5;
	}
	.empty-gear {
		margin: 1rem auto 0;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
		gap: 1rem;
		width: 100%;
		max-width: 800px;
	}
	.card {
		background: #fff;
		border: 2px solid #e5e7eb;
		border-radius: 12px;
		overflow: hidden;
		cursor: pointer;
		transition: border-color 0.15s, box-shadow 0.15s;
		position: relative;
	}
	.card:hover {
		border-color: #4f46e5;
		box-shadow: 0 4px 12px rgba(79,70,229,0.12);
	}
	.card-preview {
		aspect-ratio: 2 / 3;
		background: #f3f4f6;
		overflow: hidden;
	}
	.card-preview img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.no-bg {
		display: flex;
		align-items: center;
		justify-content: center;
		height: 100%;
		color: #9ca3af;
		font-size: 0.85rem;
	}
	.card-info {
		padding: 0.7rem;
	}
	.card-info h3 {
		margin: 0;
		font-size: 0.95rem;
	}
	.meta {
		font-size: 0.8rem;
		color: #9ca3af;
	}
	.delete-btn {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		background: rgba(239,68,68,0.9);
		color: #fff;
		border: none;
		border-radius: 6px;
		padding: 0.3rem 0.6rem;
		font-size: 0.75rem;
		cursor: pointer;
		opacity: 0;
		transition: opacity 0.15s;
	}
	.card:hover .delete-btn {
		opacity: 1;
	}

	.settings-overlay {
		position: fixed;
		inset: 0;
		background: rgba(0,0,0,0.4);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: 100;
	}
	.settings-panel {
		background: #fff;
		border-radius: 16px;
		padding: 2rem;
		width: 480px;
		max-width: 90vw;
		box-shadow: 0 20px 60px rgba(0,0,0,0.2);
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
		font-size: 1.2rem;
	}
	.close-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border: none;
		border-radius: 8px;
		background: transparent;
		color: #6b7280;
		cursor: pointer;
	}
	.close-btn:hover {
		background: #f3f4f6;
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
		border: 2px solid #e5e7eb;
		border-radius: 12px;
	}
	.device-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 44px;
		height: 44px;
		border-radius: 10px;
		background: #f3f4f6;
		color: #6b7280;
		flex-shrink: 0;
	}
	.device-info {
		flex: 1;
		min-width: 0;
	}
	.device-label {
		display: block;
		font-weight: 600;
		font-size: 0.95rem;
		margin-bottom: 0.15rem;
	}
	.device-desc {
		display: block;
		font-size: 0.82rem;
		color: #6b7280;
	}
	.status-connected {
		color: #16a34a;
		font-weight: 600;
	}
	.status-disconnected {
		color: #9ca3af;
	}
	.action-btn {
		padding: 0.5rem 1.2rem;
		border: none;
		border-radius: 8px;
		font-weight: 600;
		font-size: 0.85rem;
		cursor: pointer;
		transition: opacity 0.15s;
		flex-shrink: 0;
	}
	.action-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.action-btn.connect {
		background: #4f46e5;
		color: #fff;
	}
	.action-btn.disconnect {
		background: #fee2e2;
		color: #dc2626;
	}
	.action-btn:hover:not(:disabled) {
		opacity: 0.85;
	}
</style>
