<script lang="ts">
	import { Button } from '$lib/components/ui/button/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import {
		FieldGroup,
		Field,
		FieldLabel,
		FieldDescription,
		FieldSeparator
	} from '$lib/components/ui/field/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { cn } from '$lib/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let { class: className, ...restProps }: HTMLAttributes<HTMLDivElement> = $props();
	const id = $props.id();

	let email    = $state('');
	let password = $state('');
	let error    = $state('');
	let loading  = $state(false);

	async function login(e: Event) {
		e.preventDefault();
		loading = true;
		error   = '';

		const res = await fetch('/api/auth/login', {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({ email, password }),
		});

		const data = await res.json();

		if (!res.ok) {
			error   = data.error ?? 'Login gagal';
			loading = false;
			return;
		}

		window.location.href = '/';
	}
</script>

<div class={cn('flex flex-col gap-6', className)} {...restProps}>
	<Card.Root>
		<Card.Header class="text-center">
			<p class="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">SCM SaaS</p>
			<Card.Title class="text-xl">Welcome back</Card.Title>
			<Card.Description>Sign in to your account to continue</Card.Description>
		</Card.Header>

		<Card.Content>
			<form onsubmit={login}>
				<FieldGroup>

					{#if error}
						<div class="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5">
							<p class="font-mono text-xs text-destructive">{error}</p>
						</div>
					{/if}

					<Field>
						<FieldLabel for="email-{id}">Email</FieldLabel>
						<Input
							id="email-{id}"
							type="email"
							placeholder="admin@scm.dev"
							bind:value={email}
							required
						/>
					</Field>

					<Field>
						<div class="flex items-center">
							<FieldLabel for="password-{id}">Password</FieldLabel>
						</div>
						<Input
							id="password-{id}"
							type="password"
							placeholder="••••••••"
							bind:value={password}
							required
						/>
					</Field>

					<Field>
						<Button type="submit" class="w-full" disabled={loading}>
							{loading ? 'Signing in...' : 'Sign in'}
						</Button>
					</Field>

				</FieldGroup>
			</form>
		</Card.Content>
	</Card.Root>

	<div class="rounded-lg border px-4 py-3">
		<p class="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
			Dev accounts
		</p>
		<div class="space-y-1 font-mono text-xs text-muted-foreground">
			<p><span class="text-foreground">admin@scm.dev</span> — password123 (admin)</p>
			<p><span class="text-foreground">viewer@scm.dev</span> — password123 (viewer)</p>
		</div>
	</div>
</div>