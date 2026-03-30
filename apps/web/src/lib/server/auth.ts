// apps/web/src/lib/server/auth.ts
import { JWT_SECRET } from '$env/static/private';

export type Role = 'admin' | 'viewer';

export interface JwtPayload {
	sub: string;  // user id
	email: string;
	role: Role;
	iat: number;
	exp: number;
}

const SECRET = new TextEncoder().encode( JWT_SECRET );
const ALG = 'HS256';

// ── Sign ─────────────────────────────────────────────────────────────────────
export async function signJwt( payload: Omit<JwtPayload, 'iat' | 'exp'> ): Promise<string> {
	const now = Math.floor( Date.now() / 1000 );
	const full = { ...payload, iat: now, exp: now + 60 * 60 * 24 }; // 24h

	const header = b64url( JSON.stringify( { alg: ALG, typ: 'JWT' } ) );
	const body = b64url( JSON.stringify( full ) );
	const sig = await hmac( `${header}.${body}` );

	return `${header}.${body}.${sig}`;
}

// ── Verify ────────────────────────────────────────────────────────────────────
export async function verifyJwt( token: string ): Promise<JwtPayload | null> {
	try {
		const [header, body, sig] = token.split( '.' );
		const expected = await hmac( `${header}.${body}` );
		if ( sig !== expected ) return null;

		const payload: JwtPayload = JSON.parse( atob( body.replace( /-/g, '+' ).replace( /_/g, '/' ) ) );
		if ( payload.exp < Math.floor( Date.now() / 1000 ) ) return null;

		return payload;
	} catch {
		return null;
	}
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function b64url( str: string ) {
	return btoa( str ).replace( /\+/g, '-' ).replace( /\//g, '_' ).replace( /=/g, '' );
}

async function hmac( data: string ) {
	const key = await crypto.subtle.importKey(
		'raw', SECRET, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
	);
	const sig = await crypto.subtle.sign( 'HMAC', key, new TextEncoder().encode( data ) );
	return b64url( String.fromCharCode( ...new Uint8Array( sig ) ) );
}

// ── Password hash (Web Crypto — no bcrypt needed) ────────────────────────────
export async function hashPassword( password: string ): Promise<string> {
	const buf = await crypto.subtle.digest( 'SHA-256', new TextEncoder().encode( password ) );
	return Array.from( new Uint8Array( buf ) ).map( b => b.toString( 16 ).padStart( 2, '0' ) ).join( '' );
}

export async function verifyPassword( password: string, hash: string ): Promise<boolean> {
	return ( await hashPassword( password ) ) === hash;
}