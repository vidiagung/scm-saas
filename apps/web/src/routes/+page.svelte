<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import Map from '$lib/components/comp/Map.svelte';
	import { ws } from '$lib/ws';

	// ── Types ────────────────────────────────────────────────────────────────────
	type NodeStatus = 'ok' | 'warn' | 'err';

	interface SensorNode {
		id: string;
		name: string;
		type: 'warehouse' | 'truck';
		temp: number;
		stock: number;
		speed: number;
		delay: number;
		status: NodeStatus;
		lat: number;
		lng: number;
		targetLat?: number;
		targetLng?: number;
	}

	interface LogEntry {
		ts: string;
		msg: string;
		level: 'ok' | 'warn' | 'err' | 'info';
	}

	// ── State ────────────────────────────────────────────────────────────────────
	let running = $state(true);
	let tick = $state(0);
	let disruptActive = $state(false);
	let disruptTarget = $state<string | null>(null);
	let logs = $state<LogEntry[]>([]);

	let nodes = $state<SensorNode[]>([
		{
			id: 'WH-JKT',
			name: 'Jakarta Warehouse',
			type: 'warehouse',
			temp: 24.2,
			stock: 280,
			speed: 0,
			delay: 0,
			status: 'ok',
			lat: -6.2,
			lng: 106.8
		},
		{
			id: 'WH-SBY',
			name: 'Surabaya Warehouse',
			type: 'warehouse',
			temp: 25.1,
			stock: 340,
			speed: 0,
			delay: 0,
			status: 'ok',
			lat: -7.2,
			lng: 112.7
		},
		{
			id: 'TRK-001',
			name: 'Truk #001 (JKT→SBY)',
			type: 'truck',
			temp: 22.5,
			stock: 0,
			speed: 76,
			delay: 0,
			status: 'ok',
			lat: -6.2,
			lng: 106.8,
			targetLat: -7.2,
			targetLng: 112.7
		},
		{
			id: 'TRK-002',
			name: 'Truk #002 (SBY→MKS)',
			type: 'truck',
			temp: 23.0,
			stock: 0,
			speed: 78,
			delay: 0,
			status: 'ok',
			lat: -7.2,
			lng: 112.7,
			targetLat: -5.1,
			targetLng: 119.4
		}
	]);

	let mapPoints = $derived(
		nodes.map((n) => ({
			id: n.id,
			name: n.name,
			lat: n.lat,
			lng: n.lng,
			temperature: n.temp,
			status: n.status,
			type: n.type,
			speed: n.speed,
			delay: n.delay,
			stock: n.stock
		}))
	);

	// ── Derived KPIs ─────────────────────────────────────────────────────────────
	let onTimeDelivery = $derived(
		Math.max(
			70,
			94 -
				nodes.filter((n) => n.status === 'err').length * 4 -
				nodes.filter((n) => n.status === 'warn').length
		)
	);
	let activeShipments = $derived(247 + ((tick % 10) - 5));
	let avgEtaDelta = $derived(() => {
		const trucks = nodes.filter((n) => n.type === 'truck');
		if (trucks.length === 0) return 0;
		return Math.round(trucks.reduce((a, n) => a + n.delay, 0) / trucks.length);
	});
	// ── Simulation ───────────────────────────────────────────────────────────────
	function rand(min: number, max: number) {
		return min + Math.random() * (max - min);
	}
	function clamp(v: number, min: number, max: number) {
		return Math.max(min, Math.min(max, v));
	}

	function addLog(msg: string, level: LogEntry['level'] = 'info') {
		const ts = new Date().toTimeString().slice(0, 8);
		logs = [{ ts, msg, level }, ...logs].slice(0, 30);
	}

	function moveTruck(s: SensorNode): SensorNode {
		if (s.targetLat == null || s.targetLng == null) return s;

		const dLat = s.targetLat - s.lat;
		const dLng = s.targetLng - s.lng;

		const distance = Math.sqrt(dLat * dLat + dLng * dLng);

		if (distance > 0.03) {
			const step = 0.03;

			s.lat += (dLat / distance) * step;
			s.lng += (dLng / distance) * step;
		} else {
			const tempLat = s.lat;
			const tempLng = s.lng;

			s.lat = s.targetLat;
			s.lng = s.targetLng;

			s.targetLat = tempLat;
			s.targetLng = tempLng;
		}

		return s;
	}

	function simTick() {
		if (!running) return;
		tick++;

		nodes = nodes.map((n) => {
			let s: SensorNode = { ...n };

			if (disruptActive && s.id === disruptTarget) {
				s.status = 'err';
				s.delay = Math.min(s.delay + 5, 90);

				if (s.type === 'truck') {
					s.speed = Math.max(10, s.speed - 8);
					s = moveTruck(s);
				}
			} else {
				s.temp = clamp(s.temp + rand(-0.2, 0.2), 18, 32);

				if (s.type === 'truck') {
					s.speed = clamp(s.speed + rand(-4, 4), 40, 100);
					s.delay = Math.max(0, s.delay - 1);

					s = moveTruck(s);
				} else {
					s.stock = clamp(s.stock + rand(-10, 10), 50, 600);
					s.delay = Math.max(0, s.delay - 1);
				}

				s.status = s.temp > 28 ? 'warn' : s.type === 'warehouse' && s.stock < 80 ? 'warn' : 'ok';
			}

			return s;
		});

		const roll = Math.random();

		if (roll < 0.4) {
			const n = nodes[Math.floor(Math.random() * nodes.length)];
			if (n.type === 'truck')
				addLog(`GPS ${n.id} speed=${Math.round(n.speed)}km/h delay=${n.delay}min`, 'info');
			else addLog(`SENSOR ${n.id} suhu=${n.temp.toFixed(1)}°C stok=${Math.round(n.stock)}`, 'ok');
		} else if (roll < 0.5) {
			const n = nodes[Math.floor(Math.random() * nodes.length)];
			if (n.temp > 26) addLog(`WARN ${n.id} — suhu mendekati batas`, 'warn');
		}

		if (disruptActive && disruptTarget)
			addLog(`ALERT ${disruptTarget} — disrupsi aktif! delay meningkat`, 'err');
	}

	function toggleSim() {
		running = !running;
	}

	function triggerDisrupt() {
		disruptActive = !disruptActive;
		if (disruptActive) {
			disruptTarget = nodes[Math.floor(Math.random() * nodes.length)].id;
			addLog(`DISRUPSI dimulai pada node ${disruptTarget}`, 'err');
		} else {
			nodes = nodes.map((n) => ({ ...n, status: 'ok' as NodeStatus, delay: 0 }));
			addLog('Disrupsi selesai — sistem pulih', 'ok');
			disruptTarget = null;
		}
	}

	let interval: ReturnType<typeof setInterval>;
	onMount(() => {
		addLog('Sistem SCM simulator dimulai', 'ok');
		addLog('WebSocket terhubung ke 4 node', 'ok');
		interval = setInterval(simTick, 2000);

		// WebSocket from real backend — merges into nodes by id
		ws.onmessage = (event) => {
			const data = JSON.parse(event.data);
			if (data.type === 'sensor_update') {
				const p = data.payload;
				nodes = nodes.map((n) => (n.id === p.id ? { ...n, ...p } : n));
				addLog(`WS ${p.id} suhu=${p.temperature?.toFixed(1)}°C`, 'ok');
			}
		};
	});
	onDestroy(() => clearInterval(interval));

	// ── Tailwind dynamic class helpers ───────────────────────────────────────────
	function nodeCardBorder(status: NodeStatus) {
		if (status === 'warn') return 'border-amber-500/30';
		if (status === 'err') return 'border-red-500/40';
		return 'border-zinc-800';
	}

	function statusDotBg(status: NodeStatus) {
		if (status === 'warn') return 'bg-amber-400';
		if (status === 'err') return 'bg-red-500';
		return 'bg-emerald-500';
	}

	function logMsgColor(level: LogEntry['level']) {
		if (level === 'ok') return 'text-emerald-400';
		if (level === 'warn') return 'text-amber-400';
		if (level === 'err') return 'text-red-400';
		return 'text-zinc-300';
	}

	function logBadge(level: LogEntry['level']): { text: string; cls: string } {
		if (level === 'ok') return { text: 'OK', cls: 'text-emerald-400 border-emerald-800' };
		if (level === 'warn') return { text: 'WARN', cls: 'text-amber-400  border-amber-800' };
		if (level === 'err') return { text: 'ERR', cls: 'text-red-400   border-red-900' };
		return { text: 'INFO', cls: 'text-zinc-500  border-zinc-700' };
	}
</script>

<div class="min-h-screen bg-[#0d0d0f] p-6 text-zinc-200">
	<div class="mx-auto max-w-3xl space-y-3">
		<!-- Toolbar -->
		<div class="mb-2 flex flex-wrap items-center gap-2.5">
			{#if running}
				<span
					class="flex items-center gap-1.5 rounded-full border border-emerald-700 bg-emerald-950/40 px-3 py-1.5 font-mono text-xs font-medium text-emerald-400"
				>
					<span class="animate-pulse-dot h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
					Live Streaming
				</span>
			{:else}
				<span
					class="flex items-center gap-1.5 rounded-full border border-zinc-700 px-3 py-1.5 font-mono text-xs text-zinc-500"
				>
					Streaming Is Paused
				</span>
			{/if}

			<button
				onclick={toggleSim}
				class="cursor-pointer rounded-md border border-zinc-700 bg-transparent px-3.5 py-1.5 font-mono text-xs text-zinc-300 transition-all hover:border-zinc-500 hover:bg-zinc-900 hover:text-zinc-100 active:scale-[0.97]"
			>
				{running ? 'Pause' : 'Resume'}
			</button>

			<button
				onclick={triggerDisrupt}
				class="cursor-pointer rounded-md border px-3.5 py-1.5 font-mono text-xs transition-all active:scale-[0.97]
					{disruptActive
					? 'border-red-500 bg-red-950/20 text-red-300 hover:bg-red-950/30'
					: 'border-red-500/40 text-red-400 hover:border-red-500 hover:bg-red-950/20'}"
			>
				{disruptActive ? 'Hentikan disrupsi' : 'Simulasi disrupsi'}
			</button>

			<span class="ml-auto font-mono text-[11px] text-zinc-600">Tick: {tick}</span>
		</div>

		<div class="grid grid-cols-3 gap-2.5">
			<div class="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3.5">
				<p class="mb-1.5 font-mono text-[10px] tracking-widest text-zinc-600 uppercase">
					On-time delivery
				</p>
				<p class="text-[28px] leading-none font-semibold text-zinc-100 tabular-nums">
					{onTimeDelivery}<span class="ml-0.5 text-sm font-normal text-zinc-500">%</span>
				</p>
				<p class="mt-1.5 font-mono text-[11px] text-emerald-600">+0.0%</p>
			</div>

			<div class="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3.5">
				<p class="mb-1.5 font-mono text-[10px] tracking-widest text-zinc-600 uppercase">
					Active shipments
				</p>
				<p class="text-[28px] leading-none font-semibold text-zinc-100 tabular-nums">
					{activeShipments}
				</p>
				<p class="mt-1.5 font-mono text-[11px] text-emerald-600">+{Math.max(0, (tick % 10) - 5)}</p>
			</div>

			<div class="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3.5">
				<p class="mb-1.5 font-mono text-[10px] tracking-widest text-zinc-600 uppercase">
					Avg. ETA delta
				</p>
				{#if true}
					{@const eta = avgEtaDelta()}

					<p class="text-[28px] leading-none font-semibold text-zinc-100 tabular-nums">
						{eta > 0 ? '+' : ''}{eta}
						<span class="ml-0.5 text-sm font-normal text-zinc-500">Min</span>
					</p>

					<p class="mt-1.5 font-mono text-[11px] {eta > 20 ? 'text-amber-600' : 'text-zinc-600'}">
						{eta > 20 ? 'delay tinggi' : 'normal'}
					</p>
				{/if}
			</div>
		</div>

		<div class="grid grid-cols-2 gap-2">
			{#each nodes as node (node.id)}
				<div
					class="rounded-xl border bg-zinc-950 px-3.5 py-3 transition-colors duration-300 {nodeCardBorder(
						node.status
					)}"
				>
					<div class="mb-2.5 flex items-center justify-between">
						<span class="text-[13px] font-medium text-zinc-300">{node.name}</span>
						<span
							class="h-2 w-2 rounded-full transition-colors duration-300 {statusDotBg(node.status)}"
						></span>
					</div>

					{#if node.type === 'warehouse'}
						<div class="mt-1 flex justify-between text-xs">
							<span class="font-mono text-zinc-600">Stock</span>
							<span class="text-zinc-100 tabular-nums">{Math.round(node.stock)} unit</span>
						</div>
						<div class="mt-1 flex justify-between text-xs">
							<span class="font-mono text-zinc-600">Warehouse Temperature</span>
							<span class="tabular-nums {node.temp > 27 ? 'text-amber-400' : 'text-zinc-400'}"
								>{node.temp.toFixed(1)}°C</span
							>
						</div>
						<div class="mt-1 flex justify-between text-xs">
							<span class="font-mono text-zinc-600">Door Status</span>
							<span class={node.status === 'ok' ? 'text-zinc-100' : 'text-red-400'}>
								{node.status === 'ok' ? 'Safe' : 'Check!'}
							</span>
						</div>
					{:else}
						<div class="mt-1 flex justify-between text-xs">
							<span class="font-mono text-zinc-600">Speed</span>
							<span class="text-zinc-100 tabular-nums">{Math.round(node.speed)} km/h</span>
						</div>
						<div class="mt-1 flex justify-between text-xs">
							<span class="font-mono text-zinc-600">Delay</span>
							<span class="tabular-nums {node.delay === 0 ? 'text-zinc-100' : 'text-amber-400'}">
								{node.delay > 0 ? '+' + node.delay + ' min' : 'On Time'}
							</span>
						</div>
						<div class="mt-1 flex justify-between text-xs">
							<span class="font-mono text-zinc-600">Cargo Temperature</span>
							<span class="tabular-nums {node.temp <= 26 ? 'text-zinc-100' : 'text-amber-400'}"
								>{node.temp.toFixed(1)}°C</span
							>
						</div>
					{/if}
				</div>
			{/each}
		</div>

		<div class="overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
			<div
				class="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-4 py-2.5"
			>
				<span class="font-mono text-[10px] tracking-widest text-zinc-500 uppercase"
					>Event log — WebSocket stream</span
				>
				<span class="font-mono text-[10px] text-zinc-600">{logs.length} events</span>
			</div>

			<div class="flex max-h-52 flex-col divide-y divide-zinc-800/60 overflow-y-auto">
				{#each logs.slice(0, 20) as entry (entry.ts + entry.msg)}
					{@const badge = logBadge(entry.level)}
					<div class="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-zinc-900/40">
						<span
							class="min-w-9.5 shrink-0 rounded border px-1.5 py-0.5 text-center font-mono text-[10px] {badge.cls}"
						>
							{badge.text}
						</span>
						<span class="shrink-0 font-mono text-[11px] text-zinc-600">{entry.ts}</span>
						<span class="truncate font-mono text-[11px] {logMsgColor(entry.level)}"
							>{entry.msg}</span
						>
					</div>
				{/each}
			</div>
		</div>
		<Map points={mapPoints} />
	</div>
</div>

<style>
	@keyframes pulse-dot {
		0%,
		100% {
			opacity: 1;
			transform: scale(1);
		}
		50% {
			opacity: 0.4;
			transform: scale(0.65);
		}
	}
	.animate-pulse-dot {
		animation: pulse-dot 1.4s ease-in-out infinite;
	}
</style>
