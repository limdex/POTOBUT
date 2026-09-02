<script lang="ts">
	import { goto } from '$app/navigation';
</script>

<svelte:head>
	<title>POTOBUT — Foto Booth</title>
</svelte:head>

<div class="landing">
	<div class="ambient-glow"></div>
	<div class="hero">
		<h1>POTOBUT</h1>
		<p class="tagline">Foto Booth Digital — Cetak Langsung</p>
		<button class="btn btn-pill" onclick={() => goto('/templates')}>
			Mulai Sekarang
		</button>
	</div>
</div>

<style lang="scss">
	@use '../styles/variables' as *;

	.landing {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 100dvh;
		padding: 2rem;
		background: #000000;
		position: relative;
		overflow: hidden;
	}

	.ambient-glow {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -55%);
		width: 600px;
		height: 450px;
		background: radial-gradient(circle, rgba(10, 132, 255, 0.15) 0%, rgba(10, 132, 255, 0) 70%);
		pointer-events: none;
		z-index: 0;
	}

	.hero {
		text-align: center;
		position: relative;
		z-index: 1;
		animation: hero-fade 0.6s $ease-apple;
	}

	@keyframes hero-fade {
		from { opacity: 0; transform: translateY(12px) scale(0.98); }
		to { opacity: 1; transform: translateY(0) scale(1); }
	}

	.hero h1 {
		font-size: 4.5rem;
		font-weight: 800;
		margin: 0;
		letter-spacing: -0.04em;
		background: linear-gradient(180deg, #ffffff 40%, rgba(255, 255, 255, 0.65) 100%);
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.tagline {
		font-size: 1.25rem;
		font-weight: 400;
		letter-spacing: -0.015em;
		color: $color-text-muted;
		margin: 0.85rem 0 2.5rem;
	}
</style>

