import { isValidCpf } from '@falcao-rh/contracts'

/** CPF no formato 000.000.000-00 enquanto se digita: só números, no máximo 11. */
export const maskCpf = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  return digits
    .replace(/^(\d{3})(\d)/, '$1.$2')
    .replace(/^(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4')
}

export const cpfStatus = (value: string): 'incomplete' | 'invalid' | 'valid' => {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 11) return 'incomplete'
  return isValidCpf(digits) ? 'valid' : 'invalid'
}
