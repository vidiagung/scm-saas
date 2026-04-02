// apps/web/src/hooks.server.ts
import type { Handle } from '@sveltejs/kit';
import { verifyJwt } from '$lib/server/auth';

// Routes yang tidak perlu auth
const PUBLIC_ROUTES = ['/login', '/api/auth/login', '/api/auth/register', '/'];

export const handle: Handle = async ( { event, resolve } ) => {
	const isPublic = PUBLIC_ROUTES.some( ( r ) => event.url.pathname === r || event.url.pathname.startsWith( '/api/auth' ) );

	const token = event.cookies.get( 'scm_token' );

	if ( token ) {
		const payload = await verifyJwt( token );
		if ( payload ) {
			event.locals.user = {
				id: payload.sub,
				email: payload.email,
				role: payload.role,
			};
		}
	}

	// Redirect ke login kalau belum auth dan bukan public route
	if ( !isPublic && !event.locals.user ) {
		return new Response( null, {
			status: 302,
			headers: { location: '/login' },
		} );
	}

	// Redirect ke dashboard kalau sudah login dan buka /login
	if ( event.url.pathname === '/login' && event.locals.user ) {
		return new Response( null, {
			status: 302,
			headers: { location: '/dashboard' },
		} );
	}

	return resolve( event );
};