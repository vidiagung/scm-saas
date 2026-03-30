// apps/web/src/routes/api/auth/register/+server.ts
import { json } from '@sveltejs/kit';
import { hashPassword, signJwt } from '$lib/server/auth';
import { prisma } from '$lib/server/db';

export async function POST( { request, cookies } ) {
	const { email, password, role } = await request.json();

	if ( !email || !password ) {
		return json( { error: 'Email dan password wajib diisi' }, { status: 400 } );
	}

	const existing = await prisma.user.findUnique( { where: { email } } );
	if ( existing ) {
		return json( { error: 'Email sudah terdaftar' }, { status: 409 } );
	}

	const passwordHash = await hashPassword( password );

	const user = await prisma.user.create( {
		data: {
			email,
			passwordHash,
			// Hanya admin yang bisa set role — default viewer
			role: role === 'admin' ? 'admin' : 'viewer',
		},
	} );

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

	return json( { ok: true, role: user.role }, { status: 201 } );
}