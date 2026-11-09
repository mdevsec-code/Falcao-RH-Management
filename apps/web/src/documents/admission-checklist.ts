/**
 * Relação de documentos para admissão da Falcão (revisada pelo RH em
 * 09/11/2026). Obrigatórios: todo candidato entrega. Complementares: só quando
 * se aplicam (dependentes, cônjuge, formação, função).
 */
export type ChecklistItem = { label: string; detail?: string }

export const ADMISSION_REQUIRED: ChecklistItem[] = [
  { label: 'RG', detail: 'Registro Geral' },
  { label: 'CPF', detail: 'Cadastro de Pessoa Física' },
  { label: 'Título de eleitor' },
  { label: 'Carteira de Trabalho Digital', detail: 'Baixe o aplicativo CTPS Digital' },
  { label: 'Certificado de reservista', detail: 'Para homens' },
  { label: 'Comprovante de residência' },
  { label: 'Comprovante de escolaridade' },
  { label: '1 foto 3x4' },
  { label: 'Comprovante de inscrição no PIS/PASEP', detail: 'Ou extrato do CNIS' },
  { label: 'Carteira de vacinação', detail: 'Com a vacina antitetânica' },
]

export const ADMISSION_OPTIONAL: ChecklistItem[] = [
  { label: 'Certidão de nascimento ou RG com CPF dos dependentes' },
  { label: 'Certidão de casamento ou união estável', detail: 'Com o CPF' },
  { label: 'Comprovante de frequência escolar dos filhos' },
  { label: 'Carteira de vacinação dos filhos' },
  { label: 'Certificado de ensino técnico ou superior' },
  { label: 'NR 06, NR 10, NR 12, NR 33 e NR 35', detail: 'A empresa faz o treinamento' },
  { label: 'Certidão de antecedentes criminais' },
  { label: 'Conta bancária Itaú', detail: 'Abra pelo aplicativo ou leve a carta no dia da admissão' },
]
