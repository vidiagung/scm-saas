// apps/web/src/routes/api/auth/logout/+server.ts
import { json } from '@sveltejs/kit';

export async function POST( { cookies } ) {
	cookies.delete( 'scm_token', { path: '/' } );
	return json( { ok: true } );
}