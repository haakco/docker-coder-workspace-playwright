# docker-coder-workspace-playwright

Coder workspace image with [Playwright](https://playwright.dev/) and all three
browsers (chromium, firefox, webkit) pre-installed. Extends
[`ghcr.io/haakco/coder-workspace`](https://github.com/haakco/docker-coder-workspace).

Use this image for Coder templates whose projects run browser-based tests
(end-to-end QA, visual regression, scraping). Browsers live at
`/ms-playwright` (set via `PLAYWRIGHT_BROWSERS_PATH`) so they're shared across
workspaces and not duplicated into each `/home/coder` PVC.

## Image

`ghcr.io/haakco/coder-workspace-playwright:latest`

## What's included on top of the base

- `playwright` npm package installed globally
- Chromium, Firefox, WebKit binaries at `/ms-playwright`
- All OS-level browser dependencies (`--with-deps`): libnss3, libgtk-4-1,
  libasound2t64, libxkbcommon0, etc.
- `PLAYWRIGHT_BROWSERS_PATH=/ms-playwright` exported for every shell
- **LLM CLIs refreshed to latest at build time**: `@google/gemini-cli`,
  `@openai/codex`, `claude` (self-update), `opencode` (self-update). The
  base image already installs these; this layer ensures the playwright
  extender ships current versions between base rebuilds.
- **`llmUpdate` script** in `/usr/local/bin` — see below.

## Updating LLM CLIs in a running workspace

Run `llmUpdate` inside the workspace shell:

```bash
$ llmUpdate
==> npm install --prefix /home/coder/.local -g @google/gemini-cli @openai/codex
==> claude update
==> opencode upgrade
Versions after update:
  gemini   X.Y.Z
  codex    X.Y.Z
  claude   X.Y.Z
  opencode X.Y.Z
```

The npm tools install into `~/.local`, which is on PATH **before** `/usr/bin`
(set in the base image's `.zshrc`/`.bashrc`), so the per-user versions
shadow the system-baked ones. No sudo is required, and the installs
persist on the home PVC across pod restarts. `claude update` and
`opencode upgrade` use each CLI's built-in self-updater.

## Using it from a project

If the project's `package.json` pins a Playwright version close to the one
baked into the image, `npx playwright test` will reuse the system browsers
with zero download. If versions diverge enough that Playwright wants
different browser builds, it will download into the user cache (still inside
the home PVC, so cached for that workspace).

```bash
# Verify the system browsers are visible from inside a workspace
ls $PLAYWRIGHT_BROWSERS_PATH
# chromium-XXXX  firefox-XXXX  webkit-XXXX  ffmpeg-XXXX

# Run tests against the pre-baked browsers
npx playwright test
```

## Build

Pushes to `main` touching `docker_build/**` or the workflow itself
automatically rebuild and push via
[`.github/workflows/build_docker.yml`](.github/workflows/build_docker.yml).

A weekly scheduled rebuild runs Sunday 21:15 UTC, offset from the base
(20:30), `-php` (20:45) and `-vorrent` (21:00) rebuilds so the base layer
lands fresh before this image's layer rebuilds.

To pin a specific Playwright version at build time:

```bash
docker buildx build \
  --build-arg PLAYWRIGHT_VERSION=1.55.0 \
  --tag ghcr.io/haakco/coder-workspace-playwright:1.55.0 \
  --file docker_build/Dockerfile .
```

## Consumer

Coder templates in
[`haakco/prod-infra`](https://github.com/haakco/prod-infra)
(`htz/germ/tf-ha/080_coder/templates/<template>/main.tf`) reference this image
by setting `image = "ghcr.io/haakco/coder-workspace-playwright:latest"` in
their workspace module call. prod-infra does not build images — see that
repo's Coder docs for the split of concerns.

## GHCR cross-repo access

Because this image `FROM ghcr.io/haakco/coder-workspace`, this repo must be
listed under **Manage Actions access** with **Read** role on the
`coder-workspace` GHCR package. That's a one-time UI step in the package
settings — there is no REST API for it.
