import { json } from '@sveltejs/kit';
import { signJwt, verifyPassword } from '$lib/server/auth';
import { prisma } from '$lib/server/db';

export async function POST( { request, cookies } ) {
	const { email, password } = await request.json();

	if ( !email || !password ) {
		return json( { error: 'Email dan password wajib diisi' }, { status: 400 } );
	}

	const user = await prisma.user.findUnique( { where: { email } } );
	if ( !user ) {
		return json( { error: 'Email atau password salah' }, { status: 401 } );
	}

	const valid = await verifyPassword( password, user.passwordHash );
	if ( !valid ) {
		return json( { error: 'Email atau password salah' }, { status: 401 } );
	}

	const token = await signJwt( {
		sub: user.id,
		email: user.email,
		role: user.role as 'admin' | 'viewer',
	} );

	cookies.set( 'scm_token', token, {
		path: '/',
		httpOnly: true,
		sameSite: 'strict',
		secure: process.env.NODE_ENV === 'production',
		maxAge: 60 * 60 * 24,
	} );

	return json( { ok: true, role: user.role } );
}