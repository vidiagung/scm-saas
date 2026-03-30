<script lang="ts">
	// apps/web/src/routes/login/+page.svelte
	let email = $state('');
	let password = $state('');
	let error = $state('');
	let loading = $state(false);

	async function login() {
		loading = true;
		error = '';

		const res = await fetch('/api/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ email, password })
		});

		const data = await res.json();

		if (!res.ok) {
			error = data.error ?? 'Login gagal';
			loading = false;
			return;
		}

		// Redirect ke dashboard
		window.location.href = '/';
	}
</script>

<div class="flex min-h-screen items-center justify-center bg-[#0d0d0f] px-4">
	<div class="w-full max-w-sm">
		<!-- Header -->
		<div class="mb-8 text-center">
			<p class="font-mono text-xs tracking-widest text-zinc-600 uppercase">SCM SaaS</p>
			<h1 class="mt-2 text-xl font-semibold text-zinc-100">Sign in</h1>
		</div>

		<!-- Form -->
		<div class="space-y-3">
			{#if error}
				<div class="rounded-lg border border-red-900 bg-red-950/30 px-4 py-2.5">
					<p class="font-mono text-xs text-red-400">{error}</p>
				</div>
			{/if}

			<div>
				<label for="email" class="mb-1.5 block font-mono text-[11px] tracking-widest text-zinc-600 uppercase">
					Email
				</label>
				<input
					type="email"
					bind:value={email}
					placeholder="admin@scm.dev"
					class="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 font-mono text-sm text-zinc-100 placeholder-zinc-700 transition outline-none focus:border-zinc-600 focus:ring-0"
				/>
			</div>

			<div>
				<label for="password" class="mb-1.5 block font-mono text-[11px] tracking-widest text-zinc-600 uppercase">
					Password
				</label>
				<input
					type="password"
					bind:value={password}
					placeholder="••••••••"
					onkeydown={(e) => e.key === 'Enter' && login()}
					class="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 font-mono text-sm text-zinc-100 placeholder-zinc-700 transition outline-none focus:border-zinc-600"
				/>
			</div>

			<button
				onclick={login}
				disabled={loading}
				class="w-full cursor-pointer rounded-lg border border-zinc-700 bg-zinc-900 py-2.5 font-mono text-sm text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50"
			>
				{loading ? 'Signing in...' : 'Sign in'}
			</button>
		</div>

		<!-- Role info -->
		<div class="mt-6 rounded-lg border border-zinc-800 bg-zinc-950 px-4 py-3">
			<p class="mb-2 font-mono text-[10px] tracking-widest text-zinc-600 uppercase">Dev accounts</p>
			<div class="space-y-1 font-mono text-xs text-zinc-500">
				<p><span class="text-zinc-400">admin@scm.dev</span> — password123 (admin)</p>
				<p><span class="text-zinc-400">viewer@scm.dev</span> — password123 (viewer)</p>
			</div>
		</div>
	</div>
</div>
