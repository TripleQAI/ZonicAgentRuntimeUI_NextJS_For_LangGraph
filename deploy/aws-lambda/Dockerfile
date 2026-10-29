# The UI's standalone Next.js server as a Lambda container image (deploy/aws-lambda/deploy.sh).
# Build context: the project root. The Lambda Web Adapter extension forwards Lambda events to the
# server, so the app runs unchanged; its response streaming carries the runs' event streams.
# --provenance=false matters: Lambda rejects image indexes that carry attestations.
#   docker buildx build --platform linux/arm64 --provenance=false --sbom=false \
#     --build-arg NEXT_BASE_PATH=/agent-runtime-lg -f deploy/aws-lambda/Dockerfile .
FROM public.ecr.aws/docker/library/node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# The base path and NEXT_PUBLIC_* values are fixed at build time.
ARG NEXT_BASE_PATH=""
ARG NEXT_SERVER_ACTIONS_ALLOWED_ORIGINS=""
ARG NEXT_PUBLIC_FEATURE_ATTACHMENTS=false
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1 \
    NEXT_BASE_PATH=$NEXT_BASE_PATH NEXT_SERVER_ACTIONS_ALLOWED_ORIGINS=$NEXT_SERVER_ACTIONS_ALLOWED_ORIGINS \
    NEXT_PUBLIC_FEATURE_ATTACHMENTS=$NEXT_PUBLIC_FEATURE_ATTACHMENTS
RUN npm run build

FROM public.ecr.aws/docker/library/node:22-slim
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter
WORKDIR /app
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Lambda's filesystem is read-only except /tmp: Next.js keeps its cache there.
RUN mkdir -p .next && ln -s /tmp/next-cache .next/cache

# Server settings (RUNTIME_API_URL, AUTH_*) come from the function's environment (cdk/).
# AWS_LWA_ASYNC_INIT lets a start longer than Lambda's 10 s init phase finish in the first request.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=8080 HOME=/tmp \
    AWS_LWA_INVOKE_MODE=response_stream \
    AWS_LWA_ASYNC_INIT=true
USER node
EXPOSE 8080
CMD ["sh", "-c", "mkdir -p /tmp/next-cache && exec node server.js"]
