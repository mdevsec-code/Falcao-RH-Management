/** CPF: só dígitos, 11 posições, dígitos verificadores válidos. */
export const onlyDigits = (value: string) => value.replace(/\D/g, '')

export const isValidCpf = (raw: string): boolean => {
  const cpf = onlyDigits(raw)
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false
  const digit = (length: number) => {
    let sum = 0
    for (let i = 0; i < length; i++) sum += Number(cpf[i]) * (length + 1 - i)
    const rest = (sum * 10) % 11
    return rest === 10 ? 0 : rest
  }
  return digit(9) === Number(cpf[9]) && digit(10) === Number(cpf[10])
}

export const formatCpf = (raw: string) =>
  onlyDigits(raw).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')

/** Mostra só os 2 últimos dígitos: ***.***.***-45 */
export const maskCpf = (raw: string) => `***.***.***-${onlyDigits(raw).slice(-2)}`
