# ADR-0012: Sistema de movimento com GSAP

**Situação:** aceita, 29/10/2026

**Contexto.** O produto deve ter acabamento de altíssimo padrão, no nível dos sites da vitrine do GSAP, sem atrapalhar quem usa o sistema o dia inteiro.

**Decisão.** GSAP 3 (com SplitText, CustomEase e Flip, hoje gratuitos) para coreografia: a abertura do login (máscara do falcão, título montado por caractere, holofote sobre a grade técnica), a cortina depois do login, títulos de página revelados por caractere, entrada em cascata dos blocos, contadores, barras do painel, sino que balança com aviso novo e botão magnético. Motion (`motion/react`) só para o que é de layout: o indicador que desliza entre itens do menu e das abas, e a troca de etapas do login. Gavetas e menus usam animação CSS nos estados do Radix. Uma curva da marca (`falcon`) para tudo.

**Regras.**
- Um único momento cinematográfico por sessão (login e cortina). Telas internas animam em menos de 1 s e nunca bloqueiam o clique.
- Quem configurou o sistema para reduzir movimento recebe o estado final, sem animação (checado em todo efeito e no `MotionConfig`).
- Efeitos de mouse (holofote, magnetismo) só em dispositivos com ponteiro fino.

**Consequências.** Duas bibliotecas com papéis distintos e documentados. Os testes E2E esperam o conteúdo, não o tempo das animações.
