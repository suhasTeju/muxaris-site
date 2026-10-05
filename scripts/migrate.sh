#!/usr/bin/env bash
# scripts/migrate.sh — run database migrations as a one-off Fargate task and show its logs.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib/aws-guard.sh"

CLUSTER="muxaris"
FAMILY="muxaris-migrate"
STACK="MuxarisMigrate"

out() {
  aws cloudformation describe-stacks --stack-name "$STACK" \
    --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" --output text
}
SUBNETS="$(out PublicSubnetIds)"
SG="$(out ServiceSecurityGroupId)"
if [[ -z "$SUBNETS" || "$SUBNETS" == "None" || -z "$SG" || "$SG" == "None" ]]; then
  echo "ERROR: $STACK outputs PublicSubnetIds/ServiceSecurityGroupId not found (deploy the stack first)." >&2
  exit 1
fi

echo "→ run $FAMILY on cluster $CLUSTER"
RES="$(aws ecs run-task --cluster "$CLUSTER" --task-definition "$FAMILY" --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$SG],assignPublicIp=ENABLED}" \
  --output json)"
TASK_ARN="$(jq -r '.tasks[0].taskArn // empty' <<<"$RES")"
if [[ -z "$TASK_ARN" ]]; then
  echo "ERROR: run-task returned no task: $(jq -c '.failures' <<<"$RES")" >&2
  exit 1
fi
echo "task: $TASK_ARN"

aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK_ARN"
CODE="$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK_ARN" \
  --query 'tasks[0].containers[0].exitCode' --output text)"

echo "→ last 50 log lines (/muxaris/migrate)"
aws logs tail /muxaris/migrate --since 10m --format short 2>&1 | tail -n 50 || true

if [[ "$CODE" != "0" ]]; then
  echo "ERROR: migration task exited with code '$CODE'" >&2
  exit 1
fi
echo "migrate OK"
