# Ambiente de teste

O site do Falcão RH com dados fictícios, sem banco de dados nem login real. Serve para ver e testar as telas.

## Abrir

**Jeito 1, dois cliques:** abra a pasta do projeto e dê dois cliques em `Abrir ambiente de teste.bat`.

**Jeito 2, terminal:** na pasta do projeto (`Falcao-RH-Management`), rode:

```
npm run teste
```

O navegador abre sozinho em http://localhost:5173 quando o site estiver pronto. Na primeira vez pode levar 1 minuto.

## Fechar

Feche a janela preta (ou aperte `Ctrl+C` nela).

## Bom saber

- Os dados ficam só na memória: ao fechar e abrir de novo, tudo volta ao estado inicial.
- Se aparecer "porta em uso" (3333 ou 5173), já existe um ambiente aberto: use o que está aberto ou feche-o antes.
- Na primeira vez numa máquina nova, rode `npm install` na pasta do projeto (o `.bat` faz isso sozinho).
- Arquivos: `servidor-de-teste.mjs` (responde no lugar da API, porta 3333), `mock-portal.mjs` (dados de benefícios, mobilidade e estrangeiros) e `iniciar.mjs` (sobe os dois e o site).
