#!/usr/bin/env bash
# scripts/lib/aws-guard.sh — source this at the top of every AWS-touching script.
# Forces the secondary account and aborts on anything else.
set -euo pipefail
export AWS_PROFILE="aws-secondary-account"
export AWS_REGION="ap-south-1"
export AWS_DEFAULT_REGION="ap-south-1"
export CDK_DEFAULT_ACCOUNT="005533348545"
export CDK_DEFAULT_REGION="ap-south-1"
MUXARIS_AWS_ACCOUNT="005533348545"

if ! command -v aws >/dev/null 2>&1; then echo "aws cli not found" >&2; exit 1; fi
ACTUAL="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
if [[ "$ACTUAL" != "$MUXARIS_AWS_ACCOUNT" ]]; then
  echo "ABORT: AWS caller account is '${ACTUAL:-none}', expected ${MUXARIS_AWS_ACCOUNT} (profile aws-secondary-account)." >&2
  exit 1
fi
echo "aws-guard: account ${ACTUAL} region ${AWS_REGION} profile ${AWS_PROFILE}"
