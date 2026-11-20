@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 필요한 프로그램을 설치합니다...
python --version >nul 2>&1
if errorlevel 1 (
  echo.
  echo 파이썬이 설치되어 있지 않습니다.
  echo https://www.python.org/downloads/ 에서 설치하고,
  echo 설치 첫 화면에서 "Add python.exe to PATH" 를 꼭 체크하세요.
  pause
  exit /b 1
)
python -m pip install --upgrade pip
python -m pip install requests bcrypt openpyxl
echo.
echo 설치가 끝났습니다. 이제 2_run.bat 을 더블클릭하세요.
pause
