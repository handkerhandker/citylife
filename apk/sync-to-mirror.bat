@echo off
REM Mirror the tracked APK shell (this folder) into the ASCII build dir and build the APK.
REM Why a mirror: AGP / aapt2 refuse non-ASCII project paths, and the game repo lives in a
REM Chinese path (verified 2026-10-04: "Your project path contains non-ASCII characters").
setlocal
set "SRC=%~dp0"
set "DST=F:\codex\citylife-apk"
echo [1/2] mirror shell -^> %DST%
robocopy "%SRC%." "%DST%" /E /XD node_modules .gradle build out /XF local.properties >nul
if errorlevel 8 goto :err
echo [2/2] build ...
call "%DST%\build-apk.bat" || goto :err
exit /b 0
:err
echo MIRROR/BUILD FAILED (exit code %errorlevel%)
exit /b 1
