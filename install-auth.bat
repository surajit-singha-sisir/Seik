@echo off
echo ============================================
echo  Imgbb Auth - Install + Build
echo ============================================
cd /d D:\Web\TEMP\Imgbb

echo [1/3] Installing packages...
call npm install
if %errorlevel% neq 0 (
  echo ERROR: npm install failed
  pause
  exit /b 1
)

echo.
echo [2/3] Type-checking...
call npx tsc --noEmit
if %errorlevel% neq 0 (
  echo WARNING: Type errors found (shown above). Fix before deploying.
) else (
  echo Type check: PASSED
)

echo.
echo [3/3] Building...
call npx tsc -p tsconfig.json
if %errorlevel% neq 0 (
  echo ERROR: Build failed
  pause
  exit /b 1
)

echo.
echo ============================================
echo  BUILD COMPLETE
echo  Run: npm run dev  (development)
echo  Run: npm start    (production)
echo ============================================
pause
