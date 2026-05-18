FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci || npm install

FROM deps AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Public-facing API URL (baked into client JS). Used by code that hits the
# backend directly (bypasses the rewrite).
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
# Server-side rewrite target. Baked into the Next.js build via next.config.js's
# rewrites(). Inside docker-compose this is http://backend:8000; on Fly it's
# the backend app's internal hostname.
ARG BACKEND_URL=http://localhost:8000
ENV BACKEND_URL=${BACKEND_URL}
RUN npm run build

FROM base AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
# Next.js standalone build doesn't copy /public automatically; do it explicitly so
# static design files (frontend/public/design/*) ship with the runner image.
COPY --from=build /app/public ./public

EXPOSE 3000
CMD ["node", "server.js"]
