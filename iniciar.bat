@echo off
REM Inicia o servidor Node.js em segundo plano sem mostrar terminal
start /min /b node server.js
REM Aguarda alguns segundos para o servidor iniciar
ping 127.0.0.1 -n 3 > nul
