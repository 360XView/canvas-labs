#!/bin/bash
# Check count.sh exists and outputs numbers 1 to 5

SCRIPT="/home/student/scripts/count.sh"

if [ ! -f "$SCRIPT" ]; then
    exit 1
fi

if [ ! -x "$SCRIPT" ]; then
    exit 1
fi

OUTPUT=$("$SCRIPT" 2>&1)

# Check that output contains numbers 1 through 5
if [[ "$OUTPUT" == *"1"* ]] && [[ "$OUTPUT" == *"2"* ]] && \
   [[ "$OUTPUT" == *"3"* ]] && [[ "$OUTPUT" == *"4"* ]] && \
   [[ "$OUTPUT" == *"5"* ]]; then
    /usr/local/bin/log-check-result.sh "for-loop-script" "passed" "count.sh correctly iterates 1-5"
    exit 0
fi

exit 1
