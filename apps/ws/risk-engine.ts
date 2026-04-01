import { prisma } from "./db";
import { broadcast } from "./server";

type AlertLevel = "warn" | "err";

interface NodeState {
	id: string;
	name: string;
	type: "warehouse" | "truck";
	temperature: number;
	stock: number;
	delay: number;
	status: string;
}

interface RuleResult {
	level: AlertLevel;
	message: string;
}

// ── Throttle: hindari spam alert yang sama dalam 30 detik ─────────────────────
const recentAlerts = new Map<string, number>();
function isThrottled( key: string ): boolean {
	const last = recentAlerts.get( key );
	if ( last && Date.now() - last < 30_000 ) return true;
	recentAlerts.set( key, Date.now() );
	return false;
}

// ── Rules ─────────────────────────────────────────────────────────────────────
function evaluateRules( n: NodeState ): RuleResult[] {
	const results: RuleResult[] = [];

	// Suhu — ubah sementara untuk test
	if ( n.temperature > 24 ) {
		results.push( { level: "err", message: `Suhu kritis ${n.temperature.toFixed( 1 )}°C` } );
	} else if ( n.temperature > 22 ) { 
		results.push( { level: "warn", message: `Suhu tinggi ${n.temperature.toFixed( 1 )}°C` } );
	}

	// Delay (truck only)
	if ( n.type === "truck" ) {
		if ( n.delay > 45 ) {
			results.push( { level: "err", message: `Delay kritis +${n.delay} menit (batas 45 menit)` } );
		} else if ( n.delay > 20 ) {
			results.push( { level: "warn", message: `Delay tinggi +${n.delay} menit (batas 20 menit)` } );
		}
	}

	// Stok (warehouse only)
	if ( n.type === "warehouse" ) {
		if ( n.stock < 60 ) {
			results.push( { level: "err", message: `Stok kritis ${Math.round( n.stock )} unit (batas 60 unit)` } );
		} else if ( n.stock < 80 ) {
			results.push( { level: "warn", message: `Stok rendah ${Math.round( n.stock )} unit (batas 80 unit)` } );
		}
	}

	return results;
}

// ── Main: evaluasi semua node, simpan ke DB, broadcast ───────────────────────
export async function evaluateRisk( nodes: NodeState[] ) {
	const alerts: { nodeId: string; level: AlertLevel; message: string }[] = [];

	for ( const node of nodes ) {
		const rules = evaluateRules( node );
		for ( const rule of rules ) {
			const throttleKey = `${node.id}:${rule.message}`;
			if ( isThrottled( throttleKey ) ) continue;
			alerts.push( { nodeId: node.id, level: rule.level, message: rule.message } );
		}
	}

	if ( alerts.length === 0 ) return;

	try {
		await prisma.alertEvent.createMany( {
			data: alerts.map( ( a ) => ( {
				nodeId: a.nodeId,
				level: a.level,
				message: a.message,
			} ) ),
		} );
	} catch ( err ) {
		console.error( "[risk] alert_events write failed:", err );
	}

	broadcast( {
		type: "alert",
		payload: alerts,
	} );

	for ( const a of alerts ) {
		console.log( `[risk] ${a.level.toUpperCase()} — ${a.nodeId}: ${a.message}` );
	}
}