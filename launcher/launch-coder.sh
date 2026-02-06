#!/bin/bash
# Launch Coder - Implementation Agent
# White/silver theme terminal (clean slate for coding)

CODER_DIR="/Users/taavi/Documents/Main_Docs/3_Code/26Q1/canvas-labs"

osascript <<EOF
tell application "Terminal"
    activate

    do script "cd '$CODER_DIR' && clear && echo '
\033[1;37m╔═══════════════════════════════════════════════════════════╗
║   ██████╗ ██████╗ ██████╗ ███████╗██████╗                  ║
║  ██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔══██╗                 ║
║  ██║     ██║   ██║██║  ██║█████╗  ██████╔╝                 ║
║  ██║     ██║   ██║██║  ██║██╔══╝  ██╔══██╗                 ║
║  ╚██████╗╚██████╔╝██████╔╝███████╗██║  ██║                 ║
║   ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝                 ║
║                    Implementation Agent                     ║
╠═══════════════════════════════════════════════════════════╣
║  SCOPE                        COMMANDS                      ║
║  ─────                        ────────                      ║
║  Write code                   bun install                   ║
║  Fix bugs                     bun test:plugin               ║
║  Ship features                bun test:tui                  ║
║                                                             ║
║  INBOX: canvas-team/shared/messages/inbox/coder/            ║
║  PLANS FROM: arch    REPORTS TO: PM                         ║
╚═══════════════════════════════════════════════════════════╝\033[0m
' && claude --dangerously-skip-permissions"

    delay 1.0

    set bounds of front window to {550, 45, 1100, 1000}
    set background color of front window to {4369, 4369, 4369}
    set normal text color of front window to {60000, 60000, 60000}
    set cursor color of front window to {65535, 65535, 65535}

    set custom title of front window to "Coder - Implementation Agent"
    set title displays custom title of front window to true
end tell
EOF
