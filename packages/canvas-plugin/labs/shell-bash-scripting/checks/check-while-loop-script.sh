#!/bin/bash
# Check countdown.sh exists and counts down then says Go!

SCRIPT="/home/student/scripts/countdown.sh"

if [ ! -f "$SCRIPT" ]; then
    exit 1
fi

if [ ! -x "$SCRIPT" ]; then
    exit 1
fi

OUTPUT=$("$SCRIPT" 2>&1)

# Check that output has countdown and Go!
if [[ "$OUTPUT" == *"3"* ]] && [[ "$OUTPUT" == *"2"* ]] && \
   [[ "$OUTPUT" == *"1"* ]] && [[ "$OUTPUT" == *"Go"* ]]; then
    /usr/local/bin/log-check-result.sh "while-loop-script" "passed" "countdown.sh counts down and says Go!"
    exit 0
fi

exit 1
