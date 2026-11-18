# syntax=docker/dockerfile:1
# TimeWraith in one image: the API and the built UI. Run it with compose.yaml (it also starts the Kiro Crew).

# ---- 1. build the UI ----
FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS web
WORKDIR /web
RUN corepack enable
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm exec vite build --configLoader runner

# ---- 2. the backend ----
FROM python:3.14-slim-bookworm AS app
ENV PYTHONUNBUFFERED=1 UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy
RUN apt-get update \
    && apt-get install -y --no-install-recommends git ca-certificates \
    && rm -rf /var/lib/apt/lists/*
# The Docker CLI only: the backend starts the test containers through the host's Docker socket (see compose.yaml).
COPY --from=docker:29-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv
# uid 1000 matches the `node` user of the test containers, so both can write the same case folders.
RUN useradd --uid 1000 --create-home --shell /usr/sbin/nologin tw \
    && mkdir /data && chown tw:tw /data
WORKDIR /app/backend
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY backend/src ./src
COPY backend/agents ./agents
COPY backend/schemas ./schemas
COPY backend/docker ./docker
COPY backend/README.md ./
RUN uv sync --frozen --no-dev
COPY --from=web /web/dist /app/web
# The entrypoint starts as root to reach the Docker socket, then runs the app as `tw` (see backend/docker/entrypoint.sh).
RUN sed -i 's/\r$//' /app/backend/docker/entrypoint.sh \
    && install -m 0755 /app/backend/docker/entrypoint.sh /usr/local/bin/tw-entrypoint \
    && chown -R tw:tw /app
ENV TW_DATA_DIR=/data TW_WEB_DIR=/app/web PATH="/app/backend/.venv/bin:$PATH"
VOLUME /data
EXPOSE 8787
LABEL org.opencontainers.image.title="TimeWraith" \
      org.opencontainers.image.description="Finds, reproduces and fixes time and daylight-saving bugs in JS/TS repositories."
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD python -c "import urllib.request as u; u.urlopen('http://127.0.0.1:8787/api/v1/health', timeout=4)"
ENTRYPOINT ["tw-entrypoint"]
CMD ["uvicorn", "timewraith.api:app", "--host", "0.0.0.0", "--port", "8787"]
