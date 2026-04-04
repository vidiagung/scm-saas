<script lang="ts">
	import { toggleMode, mode } from 'mode-watcher';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Sun, Moon } from '@lucide/svelte';
</script>

<Button variant="outline" size="icon" onclick={toggleMode}>
	{#if mode.current === 'dark'}
		<Moon class="h-4 w-4" />
	{:else}
		<Sun class="h-4 w-4" />
	{/if}
	<span class="sr-only">Toggle theme</span>
</Button>
