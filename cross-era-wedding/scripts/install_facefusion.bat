@echo off
chcp 65001 >nul
REM FaceFusion Installer for Windows (CPU version)
REM ================================================
REM This script installs FaceFusion with ONNX Runtime CPU support.
REM Requirements: Python 3.10+, Git

echo ==========================================
echo FaceFusion Installer (CPU Version)
echo ==========================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH.
    echo Please install Python 3.10+ from https://www.python.org/
    exit /b 1
)

REM Check Git
git --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Git is not installed or not in PATH.
    echo Please install Git from https://git-scm.com/
    exit /b 1
)

REM Determine install directory
set "INSTALL_DIR=%USERPROFILE%\facefusion"
if not "%~1"=="" set "INSTALL_DIR=%~1"

echo Install directory: %INSTALL_DIR%
echo.

REM Clone repository
if exist "%INSTALL_DIR%" (
    echo FaceFusion directory already exists.
    choice /C YN /M "Do you want to reinstall"
    if errorlevel 2 exit /b 0
    rmdir /s /q "%INSTALL_DIR%"
)

echo Cloning FaceFusion repository...
git clone https://github.com/facefusion/facefusion.git "%INSTALL_DIR%"
if errorlevel 1 (
    echo ERROR: Failed to clone repository.
    exit /b 1
)

REM Install dependencies
cd /d "%INSTALL_DIR%"

echo.
echo Installing dependencies (CPU version)...
echo This may take several minutes...
echo.

python install.py --onnxruntime cpu
if errorlevel 1 (
    echo ERROR: Installation failed.
    exit /b 1
)

echo.
echo ==========================================
echo Installation Complete!
echo ==========================================
echo.
echo FaceFusion installed at: %INSTALL_DIR%
echo.
echo To use with Cross-Era Wedding skill, set environment variable:
echo   setx FACEFUSION_PATH "%INSTALL_DIR%\run.py"
echo.
echo Or pass it directly:
echo   node cross_era_wedding.js --facefusion-path "%INSTALL_DIR%\run.py" ...
echo.
pause
