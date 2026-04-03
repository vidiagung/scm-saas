import type { Handle } from '@sveltejs/kit';
import { verifyJwt } from '$lib/server/auth';

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

	if ( !isPublic && !event.locals.user ) {
		return new Response( null, {
			status: 302,
			headers: { location: '/login' },
		} );
	}

	if ( event.url.pathname === '/login' && event.locals.user ) {
		return new Response( null, {
			status: 302,
			headers: { location: '/dashboard' },
		} );
	}

	return resolve( event );
};