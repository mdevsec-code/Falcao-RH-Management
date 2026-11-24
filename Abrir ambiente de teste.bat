@echo off
rem Abre o ambiente de teste do Falcao RH com dois cliques. Para fechar, feche esta janela.
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando as dependencias pela primeira vez...
  call npm install
)
call npm run teste
pause
