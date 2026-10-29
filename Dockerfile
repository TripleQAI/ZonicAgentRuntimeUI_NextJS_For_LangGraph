# Zonic Agent Runtime UI (Next.js standalone server). Build: docker build -t zonic-agent-runtime-ui-langgraph .
# Server settings come from the environment at run time (.env.example); NEXT_PUBLIC_* at build time.
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
USER node
EXPOSE 3000
CMD ["node", "server.js"]
