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
RUN npm install -g "playwright@${PLAYWRIGHT_VERSION}" \
    && mkdir -p "${PLAYWRIGHT_BROWSERS_PATH}" \
    && npx --yes playwright install --with-deps chromium firefox webkit \
    && chown -R 1000:1000 "${PLAYWRIGHT_BROWSERS_PATH}" \
    && chmod -R u+rwx,go+rx "${PLAYWRIGHT_BROWSERS_PATH}" \
    && npm cache clean --force \
    && rm -rf /var/lib/apt/lists/* /tmp/* /root/.npm

# Refresh LLM coding CLIs to latest. The base image already provides these,
# but the playwright extender rebuilds independently of the base, so this
# layer pulls newer upstream releases between base rebuilds. claude/opencode
# self-update commands are best-effort — `|| true` keeps the build passing
# if upstream is briefly unreachable or interactive.
RUN npm install -g @google/gemini-cli @openai/codex \
    && (claude update || true) \
    && (opencode upgrade || true) \
    && npm cache clean --force \
    && rm -rf /root/.npm \
    && gemini --version \
    && codex --version \
    && claude --version \
    && opencode --version

# Per-user LLM updater. Installs npm tools into ~/.local (shadowing the
# system installs via PATH order) and runs the built-in self-updaters for
# claude/opencode. No sudo required. Run inside any workspace as `llmUpdate`.
COPY <<'LLMUPDATE' /usr/local/bin/llmUpdate
#!/usr/bin/env bash
# llmUpdate — refresh per-user installs of the LLM coding CLIs.
#
# npm tools install into ~/.local so updates persist on the home PVC and
# shadow the system versions on PATH (~/.local/bin is ahead of /usr/bin
# in the workspace shell init). claude/opencode self-update via their
# built-in commands.
set -euo pipefail

PREFIX="${HOME}/.local"
mkdir -p "${PREFIX}/bin"

# Explicit --registry so the install routes through the HaakCo Verdaccio cache
# even if the user has a ~/.npmrc that overrides /etc/npmrc.
REGISTRY="https://verdaccio.k8.haak.co/"
echo "==> npm install --prefix ${PREFIX} --registry ${REGISTRY} -g @google/gemini-cli @openai/codex"
npm install --prefix "${PREFIX}" --registry "${REGISTRY}" -g @google/gemini-cli @openai/codex

echo "==> claude update"
claude update || echo "  (claude update returned non-zero; check manually)"

echo "==> opencode upgrade"
opencode upgrade || echo "  (opencode upgrade returned non-zero; check manually)"

echo
echo "Versions after update:"
printf "  gemini   %s\n" "$(gemini --version 2>/dev/null || echo '?')"
printf "  codex    %s\n" "$(codex --version 2>/dev/null || echo '?')"
printf "  claude   %s\n" "$(claude --version 2>/dev/null || echo '?')"
printf "  opencode %s\n" "$(opencode --version 2>/dev/null || echo '?')"
LLMUPDATE
RUN chmod +x /usr/local/bin/llmUpdate

USER coder
WORKDIR /home/coder
ENTRYPOINT ["/usr/local/bin/workspace-entrypoint.sh"]
