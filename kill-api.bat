@echo off
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4001 ^| findstr LISTENING') do taskkill /F /PID %%a
echo Done
