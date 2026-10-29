#!/usr/bin/env bash
# Deploy the LangGraph runtime UI at the lowest standing cost: its standalone Next.js server on
# Lambda (arm64 container image, streaming Function URL) behind CloudFront. See
# cdk/lib/runtime-ui-stack.ts.
#
# The public address, https://dev.tripleq.ai/agent-runtime-lg/, is served by the front door
# (D:/Zonic/agent-build-run/dev-tripleq-frontdoor), which routes the path to this stack's
# distribution. Run its deploy.sh once after this stack exists.
#
# Idempotent: the first run creates everything; later runs build, push and roll forward.
#
# Usage (from this project's root, in Git Bash or Linux, with Docker running):
#   bash deploy/aws-lambda/deploy.sh
#
# Settings are in cdk/cdk.json ("runtimeUi"). The Auth.js secret is the SecureString named
# there; the first run generates it. Sign-in needs the Cognito app client to list the stack's
# OidcCallbackUrl output as a callback URL: the script checks it and says so when it does not.
#
# Remove everything:
#   aws cloudformation delete-stack --stack-name AgentRuntimeUiLgStack
#   aws ecr delete-repository --repository-name zonic-agent-runtime-ui-langgraph --force
#
# Overridable environment variables:
#   AWS_PROFILE (default tripleq-development)
#   AWS_REGION  (default us-east-1)
#   ECR_REPO    (default zonic-agent-runtime-ui-langgraph)
#   IMAGE_TAG   (an image already in ECR_REPO: skips the build and push)
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CDK_DIR="$ROOT/deploy/aws-lambda/cdk"
export AWS_PROFILE="${AWS_PROFILE:-tripleq-development}"
REGION="${AWS_REGION:-us-east-1}"
REPO="${ECR_REPO:-zonic-agent-runtime-ui-langgraph}"
STACK=AgentRuntimeUiLgStack
ARCH=arm64

log() { printf '\n==> %s\n' "$*"; }

# Windows AWS CLI needs a Windows path for local files.
native_path() { cygpath -w "$1" 2>/dev/null || printf '%s' "$1"; }

aws_() { aws --region "$REGION" "$@"; }
# Git Bash rewrites arguments that start with "/" (parameter names, "/*") into Windows
# paths. Docker needs that rewriting for local paths, so it is off only for these calls.
aws_raw() { MSYS_NO_PATHCONV=1 aws --region "$REGION" "$@"; }

setting() {  # a value of cdk.json "runtimeUi"
  python -c 'import json,sys; print(json.load(open(sys.argv[1]))["context"]["runtimeUi"][sys.argv[2]])' \
    "$(native_path "$CDK_DIR/cdk.json")" "$1" | tr -d '\r'
}
BASE_PATH="$(setting basePath)"
PUBLIC_HOST="$(setting publicUrl | sed -E 's#^https?://([^/]+).*#\1#')"
SECRET_PARAMETER="$(setting authSecretParameter)"
CLIENT_ID="$(setting oidcClientId)"
POOL_ID="$(setting oidcIssuer | sed 's#.*/##')"

ACCOUNT="$(aws_ sts get-caller-identity --query Account --output text)"
REGISTRY="$ACCOUNT.dkr.ecr.$REGION.amazonaws.com"
TAG="${IMAGE_TAG:-$(git -C "$ROOT" rev-parse --short HEAD 2>/dev/null || echo manual)-$(date +%Y%m%d%H%M%S)}"
IMAGE="$REGISTRY/$REPO:$TAG"
log "account $ACCOUNT, region $REGION, profile $AWS_PROFILE, path $BASE_PATH"

# --- Auth.js secret (SecureString, standard tier: free) ----------------------------
if aws_raw ssm get-parameter --name "$SECRET_PARAMETER" >/dev/null 2>&1; then
  log "secret: $SECRET_PARAMETER exists"
else
  VALUE_FILE="$(mktemp)"
  trap 'rm -f "$VALUE_FILE"' EXIT
  openssl rand -base64 33 | tr -d '\n' > "$VALUE_FILE"
  aws_raw ssm put-parameter --name "$SECRET_PARAMETER" --type SecureString --tier Standard \
    --value "file://$(native_path "$VALUE_FILE")" \
    --description 'LangGraph runtime UI: AUTH_SECRET (Auth.js session cookie key)' >/dev/null
  log "secret: generated $SECRET_PARAMETER"
fi

# --- image -------------------------------------------------------------------------
log "ECR repository $REPO"
if ! aws_ ecr describe-repositories --repository-names "$REPO" >/dev/null 2>&1; then
  aws_ ecr create-repository --repository-name "$REPO" \
    --image-scanning-configuration scanOnPush=true >/dev/null
fi
# Keep the five newest images so storage stays at cents per month.
aws_ ecr put-lifecycle-policy --repository-name "$REPO" --lifecycle-policy-text \
  '{"rules":[{"rulePriority":1,"description":"keep the 5 newest images","selection":{"tagStatus":"any","countType":"imageCountMoreThan","countNumber":5},"action":{"type":"expire"}}]}' \
  >/dev/null

if [ -n "${IMAGE_TAG:-}" ]; then
  log "image $IMAGE (IMAGE_TAG: not rebuilt)"
  aws_ ecr describe-images --repository-name "$REPO" --image-ids imageTag="$TAG" >/dev/null
else
  log "build and push $IMAGE"
  aws_ ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null
  # --provenance/--sbom off: Lambda rejects image indexes that carry attestations.
  # MSYS_NO_PATHCONV: Git Bash would turn the base path into C:/Program Files/Git/...
  MSYS_NO_PATHCONV=1 docker buildx build --platform "linux/$ARCH" --provenance=false --sbom=false \
    --build-arg NEXT_BASE_PATH="$BASE_PATH" \
    --build-arg NEXT_SERVER_ACTIONS_ALLOWED_ORIGINS="$PUBLIC_HOST" \
    -f "$(native_path "$ROOT/deploy/aws-lambda/Dockerfile")" -t "$IMAGE" --push "$(native_path "$ROOT")"
fi

# --- stack -------------------------------------------------------------------------
# CDK writes the template; CloudFormation deploys it. `cdk deploy` would publish the template
# through the bucket `cdk bootstrap` creates, and this account is not bootstrapped. The
# template has no assets and stays under the 51,200 bytes CloudFormation accepts inline.
log "stack $STACK"
TEMPLATE_DIR="$CDK_DIR/cdk.out"
(
  cd "$CDK_DIR"
  [ -d node_modules ] || npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund
  CDK_DEFAULT_ACCOUNT="$ACCOUNT" CDK_DEFAULT_REGION="$REGION" npx cdk synth "$STACK" \
    -c repositoryName="$REPO" -c imageTag="$TAG" \
    --output "$(native_path "$TEMPLATE_DIR")" --quiet
)
AUTH_SECRET="$(aws_raw ssm get-parameter --name "$SECRET_PARAMETER" --with-decryption \
  --query Parameter.Value --output text | tr -d '\r')"
aws_ cloudformation deploy --stack-name "$STACK" \
  --template-file "$(native_path "$TEMPLATE_DIR/$STACK.template.json")" \
  --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
  --parameter-overrides "AuthSecret=$AUTH_SECRET"
unset AUTH_SECRET
output() { aws_ cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue" --output text | tr -d '\r'; }
APP_URL="$(output AppUrl)"
DISTRIBUTION_DOMAIN="$(output DistributionDomainName)"
CALLBACK_URL="$(output OidcCallbackUrl)"

# --- sign-in callback --------------------------------------------------------------
if aws_ cognito-idp describe-user-pool-client --user-pool-id "$POOL_ID" --client-id "$CLIENT_ID" \
    --query 'UserPoolClient.CallbackURLs' --output text | tr '\t' '\n' | grep -qx "$CALLBACK_URL"; then
  log "Cognito client $CLIENT_ID lists $CALLBACK_URL"
else
  log "WARNING: Cognito client $CLIENT_ID does not list $CALLBACK_URL: sign-in fails until it does"
fi

# --- smoke test --------------------------------------------------------------------
# Through this stack's own distribution, which answers before the front door routes to it.
DIRECT="https://$DISTRIBUTION_DOMAIN$BASE_PATH"
log "smoke test $DIRECT"
printf 'sign-in page: '
curl -sS --retry 5 --retry-all-errors --retry-delay 3 -m 60 -o /dev/null -w '[HTTP %{http_code}]\n' "$DIRECT/login"
printf 'published address (expect 302 to the path without the slash): '
curl -sS -m 60 -o /dev/null -w '[HTTP %{http_code}] %{redirect_url}\n' "$DIRECT/"
printf 'home without a session (expect 307 to the sign-in page): '
curl -sS -m 60 -o /dev/null -w '[HTTP %{http_code}] %{redirect_url}\n' "$DIRECT"
printf 'runtime proxy without a session (expect 401): '
curl -sS -m 60 -o /dev/null -w '[HTTP %{http_code}]\n' "$DIRECT/api/runtime/v1/agents"

cat <<EOF

App:          $APP_URL  (through the front door)
Distribution: $DISTRIBUTION_DOMAIN
EOF
