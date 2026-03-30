declare global {
	namespace App {
		interface Locals {
			user?: {
				id: string;
				email: string;
				role: 'admin' | 'viewer';
			};
		}
	}
}

export { };