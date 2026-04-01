# SCM SaaS — WebSocket Server

WebSocket server & simulator untuk SCM SaaS. Mengirim data sensor realtime ke frontend dan menyimpannya ke database.

## Tech Stack

- **Runtime**: Bun v1.3.4
- **Database**: (sesuai config project)

## Setup

```sh
bun install
```

## Menjalankan Server

```sh
bun run index.ts
```

Output yang diharapkan:

```
[simulator] tick — 4 nodes broadcasted & queued to DB
[simulator] tick — 4 nodes broadcasted & queued to DB
...
```

## Seed Database

Untuk membuat data awal termasuk user default (email & password):

```sh
bun run seed
```

Cek output terminal untuk credentials login.
