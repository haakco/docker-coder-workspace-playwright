# syntax=docker/dockerfile:1

# =============================================================================
# Coder workspace image with Playwright + browsers (chromium, firefox, webkit).
# Extends ghcr.io/haakco/coder-workspace. Used by Coder templates that run
# end-to-end browser tests (skills, future QA-heavy projects).
#
# Browsers are installed system-wide at /ms-playwright so they survive across
# workspaces and are not duplicated into per-user home PVCs. Projects can
# still install a different Playwright version into their own node_modules;
# Playwright then re-downloads browsers matching that version into the user
# cache. Most projects tracking recent Playwright will reuse the system cache.
# =============================================================================
ARG BASE_IMAGE_NAME=ghcr.io/haakco/coder-workspace
ARG BASE_IMAGE_VERSION=latest

FROM ${BASE_IMAGE_NAME}:${BASE_IMAGE_VERSION}

# Pin Playwright at build time. `latest` keeps the weekly rebuild fresh; pass a
# specific version (e.g. PLAYWRIGHT_VERSION=1.55.0) at build time to lock it.
ARG PLAYWRIGHT_VERSION=latest

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_GC=1

USER root

# Install Playwright globally and its browsers + OS-level deps. `--with-deps`
# pulls every apt package the browsers need (libnss3, libgtk, libasound, etc).
# The browser CDN is intermittently flaky, so retry the download a few times.
RUN npm install -g "playwright@${PLAYWRIGHT_VERSION}" \
    && mkdir -p "${PLAYWRIGHT_BROWSERS_PATH}" \
    && (npx --yes playwright install --with-deps chromium firefox webkit \
        || (sleep 15 && npx --yes playwright install --with-deps chromium firefox webkit) \
        || (sleep 30 && npx --yes playwright install --with-deps chromium firefox webkit)) \
    && chown -R 1000:1000 "${PLAYWRIGHT_BROWSERS_PATH}" \
    && chmod -R u+rwx,go+rx "${PLAYWRIGHT_BROWSERS_PATH}" \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/* /tmp/* /root/.npm

# The agent CLIs are not installed here. The base image installs Pi, Codex and Gemini
# into /opt/agents, and this extender is rebuilt on the same nightly schedule, so a
# second install only added a moving part - and the `opencode upgrade` it carried
# blocked on an interactive prompt. Versions come from the base image; `llmUpdate`
# below is the in-workspace route to something newer.

# Per-user LLM updater. Installs the npm CLIs into ~/.local, which shadows the image's
# copies in /opt/agents by PATH order, so updates persist on the home PVC. No sudo
# required. Run inside any workspace as `llmUpdate`.
COPY <<'LLMUPDATE' /usr/local/bin/llmUpdate
#!/usr/bin/env bash
# llmUpdate — refresh per-user installs of the LLM coding CLIs.
#
# npm tools install into ~/.local so updates persist on the home PVC and shadow the
# image's copies in /opt/agents (~/.local/bin is ahead of /opt/agents/bin on PATH).
set -euo pipefail

PREFIX="${HOME}/.local"
mkdir -p "${PREFIX}/bin"

# Explicit --registry so the install routes through the HaakCo Verdaccio cache
# even if the user has a ~/.npmrc that overrides /etc/npmrc. NPM_CONFIG_REGISTRY
# lets the caller name its own cluster's cache; the fallback is the production
# hostname, which is the only one reachable from both fleets.
REGISTRY="${NPM_CONFIG_REGISTRY:-https://verdaccio.k8.haak.co/}"
echo "==> npm install --prefix ${PREFIX} --registry ${REGISTRY} -g @openai/codex"
npm install --prefix "${PREFIX}" --registry "${REGISTRY}" -g @openai/codex

echo "==> piUpdate"
piUpdate

echo
echo "Versions after update:"
printf "  codex    %s\n" "$(codex --version 2>/dev/null || echo '?')"
printf "  pi       %s\n" "$(pi --version 2>/dev/null || echo '?')"
LLMUPDATE
RUN chmod +x /usr/local/bin/llmUpdate

USER coder
WORKDIR /home/coder

# Smoke assertions, moved out of CI and into the build so they run on the shared BuildKit for
# both the PR path and the publish path: an image can no longer be published without them.
# Verbatim from the retired `Smoke test` workflow step, including its `set -e` - a heredoc RUN
# is executed through `sh -c`, so without it the trailing echo would mask any earlier failure.
# Runs as `coder` and from `WORKDIR`, matching what `docker run` validated before.
RUN <<'EOF'
set -e
node --version
corepack --version
pi --version
npx --yes playwright --version
test -d /ms-playwright
test -n "$(ls -A /ms-playwright)"
test -f /etc/coder-skel/.pi/agent/settings.json
echo SMOKE_OK
EOF

ENTRYPOINT ["/usr/local/bin/workspace-entrypoint.sh"]
