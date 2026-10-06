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
- `@playwright/mcp@0.0.83` installed at `/opt/playwright-mcp`, together with
  the Chrome for Testing revision required by its bundled Playwright.
  The image seeds Pi's MCP entry with the installed executable and
  `--headless --isolated --browser chromium --no-sandbox`; it does not fetch
  a newer MCP server at workspace startup. PHP inherits this setup.
- **Agent CLIs come from the base image**, which installs Pi and Codex into
  `/opt/agents`. This extender deliberately does not reinstall them: it is rebuilt on
  the same nightly schedule as the base, so a second install only added a moving part
  (and the `opencode upgrade` it carried blocked on an interactive prompt).
- **`llmUpdate` script** in `/usr/local/bin` — see below.

## Updating LLM CLIs in a running workspace

Run `llmUpdate` inside the workspace shell:

```bash
llmUpdate
```

Codex uses the official `https://chatgpt.com/codex/install.sh` installer and Pi
uses the official `https://pi.dev/install.sh` managed installation. Shared Coder
startup installs or migrates each CLI independently in the persistent home.
`~/.local/bin` and `~/.pi/agent/bin` precede the image baseline on PATH.
`llmUpdate` refreshes Codex, then calls `piUpdate` to update Pi and its extensions.
No sudo is required; profile installs survive Pod replacements.

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

The build runs `node /usr/local/lib/smoke-playwright-mcp.cjs` as `coder`.
It starts the exact image-seeded MCP command over stdio, navigates to a local
test page, checks its title and closes the browser. `PLAYWRIGHT_MCP_SMOKE_OK`
includes the check duration. Missing browsers, dependencies or incompatible
launch settings fail the build before publication.

Run the same build checks without publishing:

```bash
docker buildx build --platform linux/amd64 --output type=cacheonly \
  --progress plain --file docker_build/Dockerfile .
```

Update `PLAYWRIGHT_MCP_VERSION` deliberately when upgrading the MCP server;
its `install-browser` command provisions the matching browser in the same build.
Project test Playwright versions remain independent of the MCP installation.

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
