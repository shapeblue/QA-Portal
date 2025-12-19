#!/bin/bash

# GitHub PR Scraper - Management Script
# Convenient wrapper for common scraper operations

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

show_help() {
    echo "GitHub PR Scraper Management Script"
    echo ""
    echo "Usage: $0 [command]"
    echo ""
    echo "Commands:"
    echo "  run              - Run scraper once (all open PRs)"
    echo "  run <pr_number>  - Run scraper for specific PR"
    echo "  logs             - View scraper logs (last 50 lines)"
    echo "  logs-live        - Watch scraper logs in real-time"
    echo "  status           - Check scraper status and cron job"
    echo "  setup            - Run interactive cron job setup"
    echo "  disable          - Disable cron job"
    echo "  enable           - Re-enable cron job (runs setup)"
    echo "  test             - Test database connection"
    echo "  stats            - Show database statistics"
    echo "  monitor          - View monitoring logs (last 50 lines)"
    echo "  monitor-live     - Watch monitoring logs in real-time"
    echo "  monitor-status   - Check monitoring status"
    echo "  setup-monitoring - Setup monitoring cron job"
    echo "  health           - Run health check now"
    echo "  help             - Show this help message"
    echo ""
}

run_scraper() {
    echo -e "${YELLOW}Running scraper...${NC}"
    if [ -n "$1" ]; then
        echo "Scraping PR #$1"
        cd "$PROJECT_DIR" && node scripts/scrape-github-prs.js --pr-number="$1"
    else
        echo "Scraping all open PRs"
        cd "$PROJECT_DIR" && node scripts/scrape-github-prs.js
    fi
}

show_logs() {
    if [ ! -f /var/log/cloudstack-pr-scraper.log ]; then
        echo -e "${RED}Log file not found. Scraper may not have run yet.${NC}"
        exit 1
    fi
    tail -n "${1:-50}" /var/log/cloudstack-pr-scraper.log
}

watch_logs() {
    if [ ! -f /var/log/cloudstack-pr-scraper.log ]; then
        echo -e "${RED}Log file not found. Scraper may not have run yet.${NC}"
        exit 1
    fi
    echo -e "${YELLOW}Watching logs (Ctrl+C to exit)...${NC}"
    tail -f /var/log/cloudstack-pr-scraper.log
}

show_status() {
    echo -e "${YELLOW}=== Scraper Status ===${NC}"
    echo ""
    
    # Check cron job
    if crontab -l 2>/dev/null | grep -q "scraper-cron.sh"; then
        echo -e "${GREEN}✓${NC} Cron job is installed"
        echo "Schedule:"
        crontab -l | grep "scraper-cron.sh"
    else
        echo -e "${RED}✗${NC} Cron job is NOT installed"
        echo "Run '$0 setup' to install it"
    fi
    echo ""
    
    # Check log file
    if [ -f /var/log/cloudstack-pr-scraper.log ]; then
        echo -e "${GREEN}✓${NC} Log file exists"
        echo "Last 3 lines:"
        tail -n 3 /var/log/cloudstack-pr-scraper.log
    else
        echo -e "${YELLOW}⚠${NC} Log file not found (scraper hasn't run yet)"
    fi
    echo ""
    
    # Check recent cron runs
    echo "Recent cron executions (last 5):"
    grep CRON /var/log/syslog 2>/dev/null | grep scraper-cron | tail -5 || echo "  None found"
    echo ""
}

setup_cron() {
    echo -e "${YELLOW}Running cron job setup...${NC}"
    "$SCRIPT_DIR/setup-cron.sh"
}

disable_cron() {
    if crontab -l 2>/dev/null | grep -q "scraper-cron.sh"; then
        echo -e "${YELLOW}Disabling cron job...${NC}"
        (crontab -l 2>/dev/null | grep -v "scraper-cron.sh") | crontab -
        echo -e "${GREEN}✓${NC} Cron job disabled"
    else
        echo -e "${YELLOW}⚠${NC} Cron job is not installed"
    fi
}

test_connection() {
    echo -e "${YELLOW}Testing database connection...${NC}"
    cd "$PROJECT_DIR"
    
    # Load env vars
    if [ -f server/.env ]; then
        export $(cat server/.env | grep -v '^#' | xargs)
    fi
    
    if [ -z "$DB_HOST" ]; then
        echo -e "${RED}✗${NC} DB_HOST not set in server/.env"
        exit 1
    fi
    
    echo "Connecting to: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
    
    if mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" -e "SELECT 1;" 2>/dev/null; then
        echo -e "${GREEN}✓${NC} Database connection successful"
    else
        echo -e "${RED}✗${NC} Database connection failed"
        exit 1
    fi
}

show_stats() {
    echo -e "${YELLOW}=== Database Statistics ===${NC}"
    cd "$PROJECT_DIR"
    
    # Load env vars
    if [ -f server/.env ]; then
        export $(cat server/.env | grep -v '^#' | xargs)
    fi
    
    mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" << 'EOF'
SELECT 
    'PR Approvals' as Table_Name, 
    COUNT(DISTINCT pr_number) as PRs, 
    COUNT(*) as Total_Records,
    MAX(approval_created_at) as Latest_Entry
FROM pr_approvals
UNION ALL
SELECT 
    'PR Codecov', 
    COUNT(DISTINCT pr_number),
    COUNT(*),
    MAX(codecov_created_at)
FROM pr_codecov_comments
WHERE codecov_present = 1
UNION ALL
SELECT 
    'PR Trillian', 
    COUNT(DISTINCT pr_number),
    COUNT(*),
    MAX(trillian_created_at)
FROM pr_trillian_comments
WHERE trillian_present = 1
UNION ALL
SELECT 
    'PR Health Labels (Open)', 
    COUNT(DISTINCT pr_number),
    COUNT(*),
    MAX(inserted_at)
FROM pr_health_labels
WHERE pr_state = 'open';
EOF
}

show_monitor_logs() {
    if [ ! -f /var/log/cloudstack-pr-scraper-monitor.log ]; then
        echo -e "${RED}Monitor log file not found. Monitoring may not be set up.${NC}"
        exit 1
    fi
    tail -n "${1:-50}" /var/log/cloudstack-pr-scraper-monitor.log
}

watch_monitor_logs() {
    if [ ! -f /var/log/cloudstack-pr-scraper-monitor.log ]; then
        echo -e "${RED}Monitor log file not found. Monitoring may not be set up.${NC}"
        exit 1
    fi
    echo -e "${YELLOW}Watching monitoring logs (Ctrl+C to exit)...${NC}"
    tail -f /var/log/cloudstack-pr-scraper-monitor.log
}

show_monitor_status() {
    echo -e "${YELLOW}=== Monitoring Status ===${NC}"
    echo ""
    
    # Check if monitor cron job exists
    if crontab -l 2>/dev/null | grep -q "monitor-scraper.sh"; then
        echo -e "${GREEN}✓${NC} Monitoring cron job is installed"
        echo "Schedule:"
        crontab -l | grep "monitor-scraper.sh"
    else
        echo -e "${RED}✗${NC} Monitoring cron job is NOT installed"
        echo "Run '$0 setup-monitoring' to install it"
    fi
    echo ""
    
    # Check monitor log
    if [ -f /var/log/cloudstack-pr-scraper-monitor.log ]; then
        echo -e "${GREEN}✓${NC} Monitor log file exists"
        echo "Last 3 lines:"
        tail -n 3 /var/log/cloudstack-pr-scraper-monitor.log
    else
        echo -e "${YELLOW}⚠${NC} Monitor log not found (monitoring hasn't run yet)"
    fi
    echo ""
}

setup_monitoring() {
    echo -e "${YELLOW}Running monitoring setup...${NC}"
    "$SCRIPT_DIR/setup-monitoring.sh"
}

run_health_check() {
    echo -e "${YELLOW}Running health check now...${NC}"
    "$SCRIPT_DIR/monitor-scraper.sh"
    echo ""
    echo "Check the monitor log for details:"
    echo "  tail /var/log/cloudstack-pr-scraper-monitor.log"
}

# Main command handling
case "${1:-help}" in
    run)
        run_scraper "$2"
        ;;
    logs)
        show_logs "${2:-50}"
        ;;
    logs-live)
        watch_logs
        ;;
    status)
        show_status
        ;;
    setup)
        setup_cron
        ;;
    enable)
        setup_cron
        ;;
    disable)
        disable_cron
        ;;
    test)
        test_connection
        ;;
    stats)
        show_stats
        ;;
    monitor)
        show_monitor_logs "${2:-50}"
        ;;
    monitor-live)
        watch_monitor_logs
        ;;
    monitor-status)
        show_monitor_status
        ;;
    setup-monitoring)
        setup_monitoring
        ;;
    health)
        run_health_check
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        show_help
        exit 1
        ;;
esac
