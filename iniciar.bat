@echo off
REM Inicia o servidor Node.js e abre o navegador automaticamente
start "Servidor" cmd /c "node server.js"
REM Aguarda alguns segundos para o servidor iniciar
ping 127.0.0.1 -n 3 > nul
start http://localhost:3000
