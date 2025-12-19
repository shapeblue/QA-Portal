#!/bin/bash

# CloudStack PR Scraper Cron Job Wrapper
# This script is designed to be run by cron

# Set up environment
cd /root/QA-Portal
export PATH=/usr/local/bin:/usr/bin:/bin:$PATH

# Load environment variables
if [ -f .env ]; then
    export $(cat .env | grep -v '^#' | xargs)
fi

# Log file
LOG_FILE="/var/log/cloudstack-pr-scraper.log"
touch "$LOG_FILE"

# Timestamp
echo "===== PR Scraper Started at $(date) =====" >> "$LOG_FILE" 2>&1

# Run the scraper
/usr/bin/node /root/QA-Portal/scripts/scrape-github-prs.js >> "$LOG_FILE" 2>&1

# Log completion
echo "===== PR Scraper Completed at $(date) =====" >> "$LOG_FILE" 2>&1
echo "" >> "$LOG_FILE" 2>&1

# Keep log file manageable (keep last 1000 lines)
tail -n 1000 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"
