@echo off
chcp 65001 >nul
title 드론 안전 체크 서버 종료기
cd /d "%~dp0"

echo ========================================================
echo   [드론 안전 체크] 5500 포트 서버 종료
echo ========================================================
echo.

set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr /C:":5500 " ^| findstr "LISTENING"') do (
    set FOUND=1
    echo [종료 중] 포트 5500 프로세스 PID %%a 를 안전하게 종료합니다...
    taskkill /F /PID %%a >nul 2>&1
    echo [완료] 서버 프로세스 PID %%a 가 종료되었습니다.
)

if "%FOUND%"=="0" (
    echo [안내] 현재 5500 포트에서 실행 중인 서버 프로세스가 없습니다.
)

echo.
echo 창을 닫으려면 아무 키나 누르세요...
pause >nul
exit /b 0
