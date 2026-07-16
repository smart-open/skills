@echo off
REM Suno.cn Music Skill 安装脚本 (Windows)
set SKILL_DIR=%USERPROFILE%\.openclaw\workspace\skills\suno-cn-music
mkdir "%SKILL_DIR%" 2>nul
xcopy /E /I /Y "%~dp0." "%SKILL_DIR%\"
echo 安装完成！请重启 OpenClaw 或在对话中说「重新加载 skill」
pause
