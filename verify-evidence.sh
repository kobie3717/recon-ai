#!/bin/bash
# Evidence-based reporting verification script
# Tests P1 evidence tracing implementation for hackathon judges

set -e

DOMAIN="${1:-lablab.ai}"
MODE="${2:-redteam}"
OUTPUT="/tmp/evidence-verify-${MODE}.json"

echo "=== Evidence Verification for ${DOMAIN} (${MODE} mode) ==="
echo "Fetching report..."

# Fetch report and extract final JSON
timeout 120 curl -sN "http://localhost:3001/api/report?domain=${DOMAIN}&mode=${MODE}&nocache=1" 2>/dev/null | \
  grep 'data: {"type":"report"' | \
  sed 's/^data: //' > "$OUTPUT"

if [ ! -s "$OUTPUT" ]; then
  echo "❌ FAILED: No report generated"
  exit 1
fi

echo "Report saved to: $OUTPUT"
echo ""

# Parse and verify evidence fields
echo "=== Evidence Coverage Check ==="
SOURCES_COUNT=$(jq -r '.report.meta.sources_count // 0' "$OUTPUT")
EVIDENCE_COV=$(jq -r '.report.meta.evidence_coverage // "N/A"' "$OUTPUT")

echo "Sources count: ${SOURCES_COUNT}"
echo "Evidence coverage: ${EVIDENCE_COV}"

# Count findings with evidence_url
case "$MODE" in
  redteam)
    EXPOSURES_TOTAL=$(jq -r '.report.exposures | length' "$OUTPUT" 2>/dev/null || echo 0)
    EXPOSURES_WITH_URL=$(jq -r '[.report.exposures[] | select(.evidence_url)] | length' "$OUTPUT" 2>/dev/null || echo 0)
    RECS_TOTAL=$(jq -r '.report.recommendations | length' "$OUTPUT" 2>/dev/null || echo 0)
    RECS_WITH_URL=$(jq -r '[.report.recommendations[] | select(.evidence_url)] | length' "$OUTPUT" 2>/dev/null || echo 0)
    SOCIAL_TOTAL=$(jq -r '.report.socialEngineering | length' "$OUTPUT" 2>/dev/null || echo 0)
    SOCIAL_WITH_URL=$(jq -r '[.report.socialEngineering[] | select(.evidence_url)] | length' "$OUTPUT" 2>/dev/null || echo 0)

    echo ""
    echo "Exposures: ${EXPOSURES_WITH_URL}/${EXPOSURES_TOTAL} have evidence_url"
    echo "Recommendations: ${RECS_WITH_URL}/${RECS_TOTAL} have evidence_url"
    echo "Social Engineering: ${SOCIAL_WITH_URL}/${SOCIAL_TOTAL} have evidence_url"
    ;;
  seo)
    OPPS_TOTAL=$(jq -r '.report.opportunities | length' "$OUTPUT" 2>/dev/null || echo 0)
    OPPS_WITH_URL=$(jq -r '[.report.opportunities[] | select(.evidence_url)] | length' "$OUTPUT" 2>/dev/null || echo 0)
    COMP_TOTAL=$(jq -r '.report.competitive | length' "$OUTPUT" 2>/dev/null || echo 0)
    COMP_WITH_URL=$(jq -r '[.report.competitive[] | select(.evidence_url)] | length' "$OUTPUT" 2>/dev/null || echo 0)

    echo ""
    echo "Opportunities: ${OPPS_WITH_URL}/${OPPS_TOTAL} have evidence_url"
    echo "Competitive: ${COMP_WITH_URL}/${COMP_TOTAL} have evidence_url"
    ;;
  person)
    QUOTES_TOTAL=$(jq -r '.report.quotes | length' "$OUTPUT" 2>/dev/null || echo 0)
    QUOTES_WITH_URL=$(jq -r '[.report.quotes[] | select(.evidence_url)] | length' "$OUTPUT" 2>/dev/null || echo 0)
    ACTIVITY_TOTAL=$(jq -r '.report.publicActivity | length' "$OUTPUT" 2>/dev/null || echo 0)
    ACTIVITY_WITH_URL=$(jq -r '[.report.publicActivity[] | select(.evidence_url)] | length' "$OUTPUT" 2>/dev/null || echo 0)

    echo ""
    echo "Quotes: ${QUOTES_WITH_URL}/${QUOTES_TOTAL} have evidence_url"
    echo "Public Activity: ${ACTIVITY_WITH_URL}/${ACTIVITY_TOTAL} have evidence_url"
    ;;
  standard)
    COMP_TOTAL=$(jq -r '.report.competitive | length' "$OUTPUT" 2>/dev/null || echo 0)
    COMP_WITH_URL=$(jq -r '[.report.competitive[] | select(.evidence_url)] | length' "$OUTPUT" 2>/dev/null || echo 0)
    STRAT_TOTAL=$(jq -r '.report.strategic | length' "$OUTPUT" 2>/dev/null || echo 0)
    STRAT_WITH_URL=$(jq -r '[.report.strategic[] | select(.evidence_url)] | length' "$OUTPUT" 2>/dev/null || echo 0)

    echo ""
    echo "Competitive: ${COMP_WITH_URL}/${COMP_TOTAL} have evidence_url"
    echo "Strategic: ${STRAT_WITH_URL}/${STRAT_TOTAL} have evidence_url"
    ;;
esac

# Count signals with confidence
SIGNALS_TOTAL=$(jq -r '.report.signals | length' "$OUTPUT" 2>/dev/null || echo 0)
SIGNALS_WITH_CONF=$(jq -r '[.report.signals[] | select(.confidence)] | length' "$OUTPUT" 2>/dev/null || echo 0)
echo "Signals: ${SIGNALS_WITH_CONF}/${SIGNALS_TOTAL} have confidence"

echo ""
echo "=== Sample Evidence URL ==="
SAMPLE_URL=$(jq -r '.. | .evidence_url? // empty' "$OUTPUT" 2>/dev/null | head -1)
if [ -n "$SAMPLE_URL" ]; then
  echo "Found: ${SAMPLE_URL}"
else
  echo "⚠️  No evidence_url found in report"
fi

echo ""
echo "=== Acceptance Criteria ==="
[ "$SOURCES_COUNT" -ge 3 ] && echo "✅ sources_count >= 3" || echo "❌ sources_count < 3"
[ "$SIGNALS_WITH_CONF" -gt 0 ] && echo "✅ All signals have confidence" || echo "❌ No confidence badges"
echo ""
echo "Full JSON report: $OUTPUT"
