#!/usr/bin/env bash
# scripts/lib/aws-guard.sh — source this at the top of every AWS-touching script.
# Forces the secondary account and aborts on anything else.
# Safe to source from an interactive shell: it never sets shell options, and uses
# `return 1` when sourced (`exit 1` only when executed directly).
_muxaris_guard() {
  export AWS_PROFILE="aws-secondary-account"
  export AWS_REGION="ap-south-1"
  export AWS_DEFAULT_REGION="ap-south-1"
  export CDK_DEFAULT_ACCOUNT="005533348545"
  export CDK_DEFAULT_REGION="ap-south-1"
  local expected="005533348545" actual
  command -v aws >/dev/null 2>&1 || { echo "aws cli not found" >&2; return 1; }
  actual="$(aws sts get-caller-identity --query Account --output text 2>/dev/null || true)"
  if [[ "$actual" != "$expected" ]]; then
    echo "ABORT: AWS caller account is '${actual:-none}', expected ${expected} (profile aws-secondary-account)." >&2
    return 1
  fi
  echo "aws-guard: account ${actual} region ${AWS_REGION} profile ${AWS_PROFILE}"
}
if ! _muxaris_guard; then
  if [[ "${BASH_SOURCE[0]}" != "$0" ]]; then
    unset -f _muxaris_guard
    return 1
  fi
  exit 1
fi
unset -f _muxaris_guard
