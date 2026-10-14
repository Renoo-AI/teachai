@echo off
cd /d %~dp0..
echo Starting Teach.ai on http://localhost:3000
start "" http://localhost:3000
node src\server.js
pause
