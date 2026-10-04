@echo off
REM citylife -> Android APK (debug build). Pure ASCII on purpose (cmd encoding rule).
REM Requires: JDK 17 + Android SDK + Gradle home, all on F: (see README-APK.md).
setlocal
set "JAVA_HOME=F:\Android\jdk-21"
set "ANDROID_HOME=F:\Android\sdk"
set "ANDROID_SDK_ROOT=F:\Android\sdk"
set "GRADLE_USER_HOME=F:\Android\gradle-home"
REM Codex desktop sandbox breaks the JVM's AF_UNIX self-pipe (codex issue 40902).
REM Pointing jdk.net.unixdomain.tmpdir at C:\Windows\Temp is the verified workaround.
set "JAVA_TOOL_OPTIONS=-Djdk.net.unixdomain.tmpdir=C:\Windows\Temp"
set "PATH=%JAVA_HOME%\bin;%ANDROID_HOME%\platform-tools;%ANDROID_HOME%\cmdline-tools\latest\bin;%PATH%"
cd /d "%~dp0"
echo [1/4] sync game files into www ...
node sync-www.cjs || goto :err
echo [2/4] cap sync android ...
call npx cap sync android || goto :err
echo [3/4] gradle assembleDebug ...
cd android
call gradlew.bat assembleDebug || goto :err
cd ..
echo [4/4] copy apk to out ...
if not exist "out" mkdir "out"
copy /y "android\app\build\outputs\apk\debug\app-debug.apk" "out\citylife-debug.apk" >nul || goto :err
echo.
echo DONE: %~dp0out\citylife-debug.apk
exit /b 0
:err
echo.
echo BUILD FAILED (exit code %errorlevel%)
exit /b 1
