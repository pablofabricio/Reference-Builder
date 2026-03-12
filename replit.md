# Reference App

## Overview

A full-stack web application for writing and organizing notes connected to references (Bible passages, Books, Sermons, Music, Poems), with community learning through channels.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **Frontend**: React + Vite (artifacts/reference-app), Tailwind CSS, shadcn/ui, React Query, Wouter routing
- **API framework**: Express 5 (artifacts/api-server)
- **Database**: PostgreSQL + Drizzle ORM
- **Auth**: JWT (jsonwebtoken + bcryptjs)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/
│   ├── api-server/           # Express 5 API server
│   │   └── src/
│   │       ├── routes/       # auth.ts, references.ts, notes.ts, channels.ts
│   │       └── middlewares/  # auth.ts (JWT middleware)
│   └── reference-app/        # React + Vite frontend
│       └── src/
│           ├── pages/        # landing, login, register, home, references, notes, channels
│           ├── components/   # AppLayout, UI components
│           └── lib/          # auth.tsx (auth context/hooks)
├── lib/
│   ├── api-spec/             # OpenAPI spec + Orval codegen config
│   ├── api-client-react/     # Generated React Query hooks
│   ├── api-zod/              # Generated Zod schemas from OpenAPI
│   └── db/
│       └── src/schema/       # users, references, referenceNodes, channels, notes
├── scripts/
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── tsconfig.json
└── package.json
```

## Database Schema

- **users**: id, name, email, password_hash, created_at
- **references**: id, type (BIBLE|MUSIC|POEM|BOOK|SERMON), title, abbreviation, author, description, created_at
- **reference_nodes**: id, type (BOOK|CHAPTER|VERSE|PAGE|SESSION|STANZA|LINE|PARAGRAPH), content, label, reference_id, parent_node_id, position
  - Unique constraint: (reference_id, parent_node_id, position)
- **notes**: id, user_id, content, reference_node_id, channel_id, visibility (PRIVATE|PUBLIC|CHANNEL), created_at
- **channels**: id, name, description, created_by, created_at
- **channel_references**: id, channel_id, reference_id
- **channel_members**: channel_id, user_id, role (OWNER|MODERATOR|MEMBER|VIEWER), joined_at

## API Endpoints

- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/me`
- `GET /api/references`, `POST /api/references`, `GET /api/references/:id`, `PUT /api/references/:id`
- `GET /api/references/:id/nodes`, `POST /api/references/:id/nodes`
- `GET /api/notes`, `POST /api/notes`, `GET /api/notes/:id`, `PUT /api/notes/:id`, `DELETE /api/notes/:id`
- `GET /api/channels`, `POST /api/channels`, `GET /api/channels/:id`, `PUT /api/channels/:id`
- `POST /api/channels/:id/join`, `POST /api/channels/:id/leave`
- `GET /api/channels/:id/references`, `POST /api/channels/:id/references`
- `GET /api/channels/:id/members`

## Auth

JWT-based auth. Token stored in localStorage as `token`. Sent as `Authorization: Bearer <token>` header.

## TypeScript & Composite Projects

- `lib/*` packages are composite and emit declarations via `tsc --build`
- `artifacts/*` are leaf packages checked with `tsc --noEmit`

## Root Scripts

- `pnpm run build` — runs typecheck then builds all packages
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly`
- `pnpm --filter @workspace/api-spec run codegen` — regenerates React Query hooks + Zod schemas
- `pnpm --filter @workspace/db run push` — push DB schema changes
