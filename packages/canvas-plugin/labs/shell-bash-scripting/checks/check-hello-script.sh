#!/bin/bash
# Check hello.sh exists, is executable, and outputs "Hello, World!"

SCRIPT="/home/student/scripts/hello.sh"

if [ ! -f "$SCRIPT" ]; then
    exit 1
fi

if [ ! -x "$SCRIPT" ]; then
    exit 1
fi

OUTPUT=$("$SCRIPT" 2>&1)
if [[ "$OUTPUT" == *"Hello, World"* ]] || [[ "$OUTPUT" == *"Hello World"* ]]; then
    /usr/local/bin/log-check-result.sh "hello-script" "passed" "hello.sh created and works correctly"
    exit 0
fi

exit 1
