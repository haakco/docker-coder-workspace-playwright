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

ARG APT_PROXY=""
ARG NPM_CONFIG_REGISTRY
USER root
RUN rm -f /etc/apt/apt.conf.d/00apt-cacher-ng && \
    if [ -n "$APT_PROXY" ]; then \
      printf 'Acquire::http::Proxy "%s";\nAcquire::https::Proxy "%s";\n' \
        "$APT_PROXY" "$APT_PROXY" > /etc/apt/apt.conf.d/00apt-cacher-ng; \
    fi

# Pin Playwright at build time. `latest` keeps the weekly rebuild fresh; pass a
# specific version (e.g. PLAYWRIGHT_VERSION=1.55.0) at build time to lock it.
ARG PLAYWRIGHT_VERSION=latest
# MCP carries its own Playwright version. Install its matching browser in the
# same build; a runtime @latest download can require a browser this image lacks.
ARG PLAYWRIGHT_MCP_VERSION=0.0.83

ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
    PLAYWRIGHT_SKIP_BROWSER_GC=1

USER root

# Keep package/dependency installation separate from browser downloads so a CDN
# failure retains completed apt work. Playwright retries downloads internally.
RUN npm install -g "playwright@${PLAYWRIGHT_VERSION}" \
    && npm install -g --prefix /opt/playwright-mcp "@playwright/mcp@${PLAYWRIGHT_MCP_VERSION}" \
    && timeout --kill-after=15s 5m npx --yes playwright install-deps chromium firefox webkit \
    && rm -rf /var/lib/apt/lists/*

# The default Firefox redirect trickled at ~30 KiB/s on 2026-10-14 while the
# publisher's direct CDN served a bounded probe at ~740 KiB/s. The supported
# per-browser override selects that same release from the official direct host.
# DOWNLOAD_CONNECTION_TIMEOUT is idle-only; the outer timeout bounds trickles.
RUN mkdir -p "${PLAYWRIGHT_BROWSERS_PATH}" \
    && timeout --kill-after=15s 5m env \
       PLAYWRIGHT_FIREFOX_DOWNLOAD_HOST=https://cdn.playwright.dev \
       npx --yes playwright install chromium firefox webkit

RUN timeout --kill-after=15s 5m \
       /opt/playwright-mcp/bin/playwright-mcp install-browser --with-deps chrome-for-testing \
    && chown -R 1000:1000 "${PLAYWRIGHT_BROWSERS_PATH}" \
    && chmod -R u+rwx,go+rx "${PLAYWRIGHT_BROWSERS_PATH}" \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/* /tmp/* /root/.npm

# The base image's generic MCP entry targets branded Chrome. These images own
# the container defaults; update both the fresh home and the persistent-home seed.
RUN for config in /home/coder/.pi/agent/mcp.json /etc/coder-skel/.pi/agent/mcp.json; do \
      jq '.mcpServers.playwright = {command: "/opt/playwright-mcp/bin/playwright-mcp", \
        args: ["--headless", "--isolated", "--browser", "chromium", "--no-sandbox"]}' \
        "$config" > "$config.tmp" \
      && cat "$config.tmp" > "$config" \
      && rm "$config.tmp" || exit 1; \
    done

COPY docker_build/smoke-playwright-mcp.cjs /usr/local/lib/smoke-playwright-mcp.cjs

# Agent baselines come from the base image. Updates use managed installs in the
# persistent user profile, without sudo.
COPY <<'LLMUPDATE' /usr/local/bin/llmUpdate
#!/usr/bin/env bash
# Refresh managed user installations of Codex and Pi.
set -euo pipefail
export PATH="${HOME}/.local/bin:${HOME}/.pi/agent/bin:${PATH}"
mkdir -p "${HOME}/.local/share/pi"

curl -fsSL --connect-timeout 10 --max-time 60 https://chatgpt.com/codex/install.sh \
  -o "${HOME}/.local/share/pi/codex-install.sh"
CODEX_NON_INTERACTIVE=1 timeout 5m sh "${HOME}/.local/share/pi/codex-install.sh" </dev/null
"${HOME}/.local/bin/codex" --version
piUpdate
LLMUPDATE
RUN chmod +x /usr/local/bin/llmUpdate

# The shared project bootstrap can skip apt browser dependencies after the
# image has installed and smoke-tested them. Browser revisions remain project-owned.
RUN mkdir -p /etc/haakco-coder \
    && printf '%s\n' browser-system-deps >> /etc/haakco-coder/image-capabilities

RUN rm -f /etc/apt/apt.conf.d/00apt-cacher-ng

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
grep -qx browser-system-deps /etc/haakco-coder/image-capabilities
test -d /ms-playwright
test -n "$(ls -A /ms-playwright)"
test -f /etc/coder-skel/.pi/agent/settings.json
node /usr/local/lib/smoke-playwright-mcp.cjs
echo SMOKE_OK
EOF

ENTRYPOINT ["/usr/local/bin/workspace-entrypoint.sh"]
