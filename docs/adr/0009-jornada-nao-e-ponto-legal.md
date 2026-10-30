# ADR-0009: Controle de jornada não é ponto eletrônico legal

**Situação:** aceita, 29/10/2026

**Contexto.** O módulo 05 pede jornadas, escalas, faltas, horas extras e banco de horas. O registro eletrônico de ponto com validade legal no Brasil segue a Portaria MTP nº 671/2021 (REP-C, REP-A, REP-P; para REP-P: registro do programa no INPI, AFD, comprovante ao trabalhador, requisitos do Anexo IX), alterada por portarias posteriores (ex.: MTP nº 4.198/2022). A pesquisa de 29/10/2026 não encontrou alterações de 2025-2026, mas as fontes eram de terceiros.

**Decisão.** O módulo de jornada será um **controle administrativo interno**: não coleta marcações como ponto oficial, não emite AFD nem comprovante e não se apresenta como ponto homologado. Telas e documentação dizem isso explicitamente. Se a Falcão quiser ponto legal, há dois caminhos: integrar um REP certificado e importar as marcações, ou abrir um projeto específico de REP-P com o jurídico, a partir do texto consolidado da Portaria no gov.br.

**Consequências.** Escalas, ocorrências e banco de horas podem ser entregues sem risco regulatório. A integração com um REP existente é o caminho mais provável e mais barato.
