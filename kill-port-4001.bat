@echo off
echo Finding process on port 4001...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :4001') do (
    echo Killing PID %%a
    taskkill /F /PID %%a
)
echo Done.
