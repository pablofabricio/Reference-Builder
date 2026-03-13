# Reference Builder (Local)

Este projeto foi ajustado para rodar localmente, sem dependencias do Replit e sem backend embutido.

## 1) Pre-requisitos

- Node.js 20+
- pnpm 10+

## 2) Instalar dependencias

```bash
pnpm install
```

## 3) Configurar API externa

No app frontend, crie o arquivo de ambiente:

```bash
cp artifacts/reference-app/.env.example artifacts/reference-app/.env
```

Edite `artifacts/reference-app/.env` e ajuste:

- `VITE_API_BASE_URL`: URL da sua API local (exemplo: `http://localhost:3000`)

## 4) Rodar o frontend local

```bash
pnpm dev
```

O app principal sobe em `http://localhost:5173`.

## Scripts uteis

- `pnpm dev`: roda o app principal (`@workspace/reference-app`)
- `pnpm dev:mockup`: roda o mockup sandbox
- `pnpm build:app`: build do app principal
- `pnpm typecheck`: valida tipos
