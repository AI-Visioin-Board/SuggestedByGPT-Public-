FROM node:22-slim

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.4.1 --activate

WORKDIR /app

# Copy dependency manifests first (better layer caching)
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install Node dependencies
RUN pnpm install --no-frozen-lockfile

# Install Playwright Chromium + all required system libraries (libnss3, libgbm1, etc.)
# --with-deps handles apt-get installs automatically. This installs Playwright's
# default Chromium revision into /root/.cache/ms-playwright/chromium-NNNN/.
RUN npx playwright install --with-deps chromium

# Patchright pins a DIFFERENT Chromium revision (e.g. chromium-1217) than the one
# `playwright install` downloads, and looks in its own subdir of the same cache.
# Without this, runtime fails with:
#   browserType.launchPersistentContext: Executable doesn't exist at
#   /root/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome
# System libs are already installed by the playwright --with-deps step above,
# so this is just the binary download (no apt needed).
RUN npx patchright install chromium && \
    ls -la /root/.cache/ms-playwright/ && \
    find /root/.cache/ms-playwright/ -name 'chrome' -type f -path '*chromium*' | head -5

# Copy source code
COPY . .

# Build (vite frontend + esbuild server bundle)
RUN pnpm run build

EXPOSE 3000

CMD ["pnpm", "run", "start"]
