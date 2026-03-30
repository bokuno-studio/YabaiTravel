#!/bin/bash

cd /Volumes/Extreme\ SSD/dev/YabaiTravel

echo "=== Starting 30-category enrichment batch test with detailed logging ==="
echo "Time: $(date)"
echo ""

# Run script with detailed output capture
node scripts/crawl/enrich-category-detail.js --limit 30 2>&1 | tee /tmp/enrich-batch-30-$(date +%s).log

echo ""
echo "=== Test complete ==="
