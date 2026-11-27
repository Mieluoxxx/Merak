---
name: Wave Worker Task
about: Parallel worker assignment with exclusive file ownership
title: "feat(scope): "
labels: wave-1
---

## Base & PR Target

- **Base branch**: `dev`
- **PR target branch**: `dev` (create a feature branch off `dev`, open PR back into `dev`)
- **Reference spec**: `docs/wave1-workers.md`

## Owned Paths (Exclusive)

- <!-- List exclusive directories/files -->

## Frozen Contracts (Do NOT Edit)

- `pnpm-lock.yaml`, `package.json`, `pnpm-workspace.yaml`
- `packages/shared/**` (`@merak/shared`)
- `packages/ui/**` (`@merak/ui`)

## Deliverables

- [ ] <!-- Deliverable 1 -->

## Verification

```sh
pnpm typecheck && pnpm test && pnpm build
```
