@echo off
cd /d "%~dp0"
start "" "http://127.0.0.1:3000"
echo Bot Control is starting...
echo Keep this window open while using the website.
echo.
node index.js
pause
