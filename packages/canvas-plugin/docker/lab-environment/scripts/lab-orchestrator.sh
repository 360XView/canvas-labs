#!/bin/bash
# Lab Orchestrator - Runs at container boot
# 1. Runs setup script for the module
# 2. Starts all check scripts in background polling loops
# 3. Keeps container alive

set -e

LOG_DIR="/var/log/lab-commands"
CHECKS_LOG="${LOG_DIR}/checks.log"

# Ensure log files exist
mkdir -p "${LOG_DIR}"
touch "${LOG_DIR}/commands.log"
touch "${CHECKS_LOG}"
chmod 666 "${LOG_DIR}/commands.log" "${CHECKS_LOG}"

echo "[orchestrator] Starting lab environment for module: ${LAB_MODULE_ID}"

# Module directory (new portable structure)
MODULE_DIR="/opt/lab/modules/${LAB_MODULE_ID}"

# 1. Run setup script if it exists
SETUP_SCRIPT="${MODULE_DIR}/setup.sh"
if [ -f "${SETUP_SCRIPT}" ]; then
    echo "[orchestrator] Running setup script: ${SETUP_SCRIPT}"
    bash "${SETUP_SCRIPT}"
else
    echo "[orchestrator] No setup script found at ${SETUP_SCRIPT}"
fi

# 2. Start all check scripts in background polling loops
CHECK_DIR="${MODULE_DIR}/checks"
if [ -d "${CHECK_DIR}" ]; then
    echo "[orchestrator] Starting check scripts from ${CHECK_DIR}"
    for check in "${CHECK_DIR}"/check-*.sh; do
        if [ -f "${check}" ]; then
            check_name=$(basename "${check}")
            echo "[orchestrator] Starting check: ${check_name}"
            (
                set +e  # Disable exit-on-error for this subshell (checks return non-zero until pass)
                while true; do
                    # Run check silently, capture output for logging on success
                    output=$(bash "${check}" 2>&1)
                    exit_code=$?
                    if [ $exit_code -eq 0 ]; then
                        # Check passed - log result and exit
                        echo "[check:${check_name}] PASSED: ${output}" >> "${CHECKS_LOG}"
                        /usr/local/bin/log-check-result.sh "${check_name}" "passed" "${output}"
                        exit 0
                    fi
                    sleep 2
                done
            ) &
        fi
    done
else
    echo "[orchestrator] No check directory found at ${CHECK_DIR}"
fi

echo "[orchestrator] Lab environment ready"

# 3. Wait for all background processes (keeps orchestrator alive)
# This runs in background, so container stays alive via bash shell
wait
