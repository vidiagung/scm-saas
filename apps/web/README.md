# SCM SaaS — Web

Frontend aplikasi SCM SaaS, dibangun dengan SvelteKit + Tailwind CSS v4 + shadcn-svelte.

## Tech Stack

- **Framework**: SvelteKit
- **Styling**: Tailwind CSS v4
- **UI Components**: shadcn-svelte
- **Runtime**: Bun

## Setup

```sh
bun install
```

## Developing

```sh
bun run dev
```

Buka di browser: `http://localhost:5173`

## Build

```sh
bun run build
bun run preview
```

## Default Credentials

Jalankan seed di `apps/ws` terlebih dahulu:

```sh
cd ../ws
bun run seed
```

Lalu cek output terminal untuk email & password default.

## Recreate Project

```sh
bun x sv@0.13.0 create --template minimal --types ts --add prettier eslint tailwindcss="plugins:none" sveltekit-adapter="adapter:auto" --install bun scm-saas
```
