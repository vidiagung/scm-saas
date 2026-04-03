<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import AppSidebar from '$lib/components/app-sidebar.svelte';
	import * as Breadcrumb from '$lib/components/ui/breadcrumb/index.js';
	import { Separator } from '$lib/components/ui/separator/index.js';
	import * as Sidebar from '$lib/components/ui/sidebar/index.js';
	import * as Card from '$lib/components/ui/card/index.js';
	import { Badge } from '$lib/components/ui/badge/index.js';
	import Map from '$lib/components/comp/Map.svelte';
	import { ws } from '$lib/ws';

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
		waypoints?: { lat: number; lng: number; type: 'land' | 'sea' }[];
	}

	interface LogEntry {
		ts: string;
		msg: string;
		level: 'ok' | 'warn' | 'err' | 'info';
	}

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
			lat: -7.25,
			lng: 112.75
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
			targetLat: -7.25,
			targetLng: 112.75
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
			lat: -7.25,
			lng: 112.75,
			targetLat: -5.14,
			targetLng: 119.43,
			waypoints: [
				{ lat: -7.25, lng: 112.75, type: 'land' },
				{ lat: -8.155, lng: 114.375, type: 'land' },
				{ lat: -8.168, lng: 114.442, type: 'sea' },
				{ lat: -8.511, lng: 115.508, type: 'land' },
				{ lat: -8.741, lng: 116.068, type: 'sea' },
				{ lat: -8.652, lng: 116.184, type: 'land' },
				{ lat: -8.588, lng: 116.468, type: 'land' },
				{ lat: -8.513, lng: 116.671, type: 'land' },
				{ lat: -8.37, lng: 116.98, type: 'sea' },
				{ lat: -8.37, lng: 117.02, type: 'land' },
				{ lat: -8.569, lng: 118.993, type: 'land' },
				{ lat: -5.14, lng: 119.43, type: 'sea' },
				{ lat: -5.14, lng: 119.43, type: 'land' }
			]
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
			stock: n.stock,
			targetLat: n.targetLat,
			targetLng: n.targetLng,
			waypoints: n.waypoints
		}))
	);

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

	function simTick() {
		if (!running) return;
		tick++;
		nodes = nodes.map((n) => {
			let s: SensorNode = { ...n };
			if (disruptActive && s.id === disruptTarget) {
				s.status = 'err';
				s.delay = Math.min(s.delay + 5, 90);
				if (s.type === 'truck') s.speed = Math.max(10, s.speed - 8);
			} else {
				s.temp = clamp(s.temp + rand(-0.2, 0.2), 18, 32);
				if (s.type === 'truck') {
					s.speed = clamp(s.speed + rand(-4, 4), 40, 100);
					s.delay = Math.max(0, s.delay - 1);
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

	function statusDot(status: NodeStatus) {
		if (status === 'warn') return 'bg-amber-400';
		if (status === 'err') return 'bg-red-500';
		return 'bg-emerald-500';
	}

	function logBadgeClass(level: LogEntry['level']) {
		if (level === 'ok')
			return 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 dark:bg-emerald-500/20 dark:text-emerald-400';
		if (level === 'warn')
			return 'bg-amber-500/10 text-amber-500 hover:bg-amber-500/20 dark:text-amber-400';
		if (level === 'err') return 'bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:text-red-400';
		return '';
	}
	function logBadgeVariant(level: LogEntry['level']): 'secondary' | 'outline' {
		return level === 'info' ? 'secondary' : 'outline';
	}
	function logBadgeLabel(level: LogEntry['level']) {
		if (level === 'ok') return 'OK';
		if (level === 'warn') return 'WARN';
		if (level === 'err') return 'ERR';
		return 'INFO';
	}
	function logTextClass(level: LogEntry['level']) {
		if (level === 'ok') return 'text-emerald-500 dark:text-emerald-400';
		if (level === 'warn') return 'text-amber-500 dark:text-amber-400';
		if (level === 'err') return 'text-red-500 dark:text-red-400';
		return '';
	}

	let interval: ReturnType<typeof setInterval>;
	onMount(() => {
		addLog('Sistem SCM simulator dimulai', 'ok');
		addLog('WebSocket terhubung ke 4 node', 'ok');
		interval = setInterval(simTick, 2000);
		ws.onmessage = (event) => {
			const data = JSON.parse(event.data);
			if (data.type === 'sensor_update' && Array.isArray(data.payload)) {
				nodes = nodes.map((n) => {
					const w = data.payload.find((p: any) => p.id === n.id);
					if (!w) return n;
					return {
						...n,
						temp: w.temperature ?? n.temp,
						stock: w.stock ?? n.stock,
						speed: w.speed ?? n.speed,
						delay: w.delay ?? n.delay,
						status: w.status ?? n.status
					};
				});
				const n = data.payload[Math.floor(Math.random() * data.payload.length)];
				if (n.type === 'truck')
					addLog(`GPS ${n.id} speed=${Math.round(n.speed)}km/h delay=${n.delay}min`, 'info');
				else
					addLog(
						`SENSOR ${n.id} suhu=${n.temperature?.toFixed(1)}°C stok=${Math.round(n.stock)}`,
						'ok'
					);
			}
		};
	});
	onDestroy(() => clearInterval(interval));
</script>

<Sidebar.Provider>
	<AppSidebar />
	<Sidebar.Inset>
		<header
			class="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12"
		>
			<div class="flex items-center gap-2 px-4">
				<Sidebar.Trigger class="-ms-1" />
				<Separator orientation="vertical" class="me-2 data-[orientation=vertical]:h-4" />
				<Breadcrumb.Root>
					<Breadcrumb.List>
						<Breadcrumb.Item class="hidden md:block">
							<Breadcrumb.Link href="##">SCM-SaaS</Breadcrumb.Link>
						</Breadcrumb.Item>
						<Breadcrumb.Separator class="hidden md:block" />
						<Breadcrumb.Item>
							<div class="flex items-center gap-2">
								{#if running}
									<Badge
										variant="outline"
										class="border-emerald-500/50 text-emerald-500 hover:bg-emerald-500/10 dark:border-emerald-500 dark:text-emerald-400"
									>
										<span class="mr-2 h-2 w-2 animate-pulse rounded-full bg-emerald-500"></span>
										Live Streaming
									</Badge>
								{:else}
									<Badge variant="outline" class="border-zinc-500/50 text-zinc-500">Paused</Badge>
								{/if}

								<button onclick={toggleSim}>
									<Badge
										variant="outline"
										class="cursor-pointer border-gray-300 hover:bg-gray-100 dark:border-gray-600 dark:hover:bg-gray-800"
									>
										{running ? 'Pause' : 'Resume'}
									</Badge>
								</button>

								<button onclick={triggerDisrupt}>
									<Badge
										variant="outline"
										class="cursor-pointer {disruptActive
											? 'border-red-500 bg-red-500/10 text-red-400'
											: 'border-red-500/50 text-red-500 hover:bg-red-500/10 dark:border-red-500 dark:text-red-400'}"
									>
										{disruptActive ? 'Hentikan disrupsi' : 'Simulasi disrupsi'}
									</Badge>
								</button>

								<span class="font-mono text-[11px] text-muted-foreground">Tick: {tick}</span>
							</div>
						</Breadcrumb.Item>
					</Breadcrumb.List>
				</Breadcrumb.Root>
			</div>
		</header>

		<div class="flex flex-1 flex-col gap-4 p-4 pt-0">
			<div class="grid auto-rows-min gap-4 md:grid-cols-3">
				<Card.Root class="p-6">
					<div class="flex flex-col gap-1">
						<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
							On-Time Delivery
						</p>
						<h3 class="text-3xl font-bold">{onTimeDelivery}%</h3>
						<p class="text-xs text-emerald-500 dark:text-emerald-400">+0.0%</p>
					</div>
				</Card.Root>

				<Card.Root class="p-6">
					<div class="flex flex-col gap-1">
						<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
							Active Shipments
						</p>
						<h3 class="text-3xl font-bold">{activeShipments}</h3>
						<p class="text-xs text-emerald-500 dark:text-emerald-400">
							+{Math.max(0, (tick % 10) - 5)}
						</p>
					</div>
				</Card.Root>

				<Card.Root class="p-6">
					{@const eta = avgEtaDelta()}
					<div class="flex flex-col gap-1">
						<p class="text-xs font-medium tracking-wider text-muted-foreground uppercase">
							Avg. ETA Delta
						</p>
						<div class="flex items-baseline gap-2">
							<h3 class="text-3xl font-bold">{eta > 0 ? '+' : ''}{eta}</h3>
							<span class="text-sm text-muted-foreground">min</span>
						</div>
						<p class="text-xs {eta > 20 ? 'text-amber-500' : 'text-muted-foreground'}">
							{eta > 20 ? 'delay tinggi' : 'normal'}
						</p>
					</div>
				</Card.Root>
			</div>

			<div class="grid auto-rows-min grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
				{#each nodes as node (node.id)}
					<Card.Root class="p-4">
						<div class="flex flex-col gap-3">
							<div class="flex items-center justify-between">
								<h4 class="text-sm font-semibold">{node.name}</h4>
								<span class="h-2 w-2 rounded-full {statusDot(node.status)}"></span>
							</div>
							<div class="space-y-2">
								{#if node.type === 'warehouse'}
									<div class="flex items-center justify-between text-xs">
										<span class="text-muted-foreground">Stock</span>
										<span class="font-medium">{Math.round(node.stock)} unit</span>
									</div>
									<div class="flex items-center justify-between text-xs">
										<span class="text-muted-foreground">Warehouse Temperature</span>
										<span class="font-medium {node.temp > 27 ? 'text-amber-500' : ''}"
											>{node.temp.toFixed(1)}°C</span
										>
									</div>
									<div class="flex items-center justify-between text-xs">
										<span class="text-muted-foreground">Door Status</span>
										<span
											class="font-medium {node.status === 'ok'
												? 'text-emerald-500 dark:text-emerald-400'
												: 'text-red-500'}"
										>
											{node.status === 'ok' ? 'Safe' : 'Check!'}
										</span>
									</div>
								{:else}
									<div class="flex items-center justify-between text-xs">
										<span class="text-muted-foreground">Speed</span>
										<span class="font-medium">{Math.round(node.speed)} km/h</span>
									</div>
									<div class="flex items-center justify-between text-xs">
										<span class="text-muted-foreground">Delay</span>
										<span
											class="font-medium {node.delay === 0
												? 'text-emerald-500 dark:text-emerald-400'
												: 'text-amber-500'}"
										>
											{node.delay > 0 ? '+' + node.delay + ' min' : 'On Time'}
										</span>
									</div>
									<div class="flex items-center justify-between text-xs">
										<span class="text-muted-foreground">Cargo Temperature</span>
										<span class="font-medium {node.temp > 26 ? 'text-amber-500' : ''}"
											>{node.temp.toFixed(1)}°C</span
										>
									</div>
								{/if}
							</div>
						</div>
					</Card.Root>
				{/each}
			</div>

			<div class="rounded-xl border bg-card text-card-foreground shadow-sm">
				<div class="flex items-center justify-between border-b px-4 py-3">
					<div class="flex items-center gap-2">
						<h4 class="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
							Event Log
						</h4>
						<span class="text-xs text-muted-foreground">— WebSocket Stream</span>
					</div>
					<Badge variant="secondary" class="text-xs">{logs.length} events</Badge>
				</div>
				<div class="max-h-48 overflow-y-auto">
					<div class="divide-y">
						{#each logs.slice(0, 20) as entry (entry.ts + entry.msg)}
							<div class="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50">
								{#if entry.level === 'info'}
									<Badge variant="secondary" class="text-xs">{logBadgeLabel(entry.level)}</Badge>
								{:else}
									<Badge class="text-xs {logBadgeClass(entry.level)}"
										>{logBadgeLabel(entry.level)}</Badge
									>
								{/if}
								<span class="font-mono text-xs text-muted-foreground">{entry.ts}</span>
								<span class="font-mono text-xs {logTextClass(entry.level)}">{entry.msg}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>

			<div class="mt-4 w-full">
				<Map points={mapPoints} />
			</div>
		</div>
	</Sidebar.Inset>
</Sidebar.Provider>

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
</style>
