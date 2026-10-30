import { describe, expect, it } from 'vitest'

import { can, employeeInput, isValidCpf, maskCpf, ROLE_PERMISSIONS } from './index'

describe('CPF', () => {
  it('aceita CPF válido com ou sem máscara', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
    expect(isValidCpf('52998224725')).toBe(true)
  })
  it('recusa dígito errado e sequências repetidas', () => {
    expect(isValidCpf('529.982.247-24')).toBe(false)
    expect(isValidCpf('111.111.111-11')).toBe(false)
    expect(isValidCpf('123')).toBe(false)
  })
  it('mascara deixando só os dois últimos dígitos', () => {
    expect(maskCpf('52998224725')).toBe('***.***.***-25')
  })
})

describe('RBAC', () => {
  it('colaborador não lê dados de outros nem dados sensíveis', () => {
    expect(can('employee', 'employees.read')).toBe(false)
    expect(can('employee', 'employees.read_sensitive')).toBe(false)
    expect(can('employee', 'self.read')).toBe(true)
  })
  it('gestor lê a equipe mas não altera cadastro nem vê dados sensíveis', () => {
    expect(can('manager', 'employees.read')).toBe(true)
    expect(can('manager', 'employees.update')).toBe(false)
    expect(can('manager', 'employees.read_sensitive')).toBe(false)
  })
  it('RH não administra usuários nem configurações', () => {
    expect(can('hr', 'users.manage')).toBe(false)
    expect(can('hr', 'settings.manage')).toBe(false)
  })
  it('administrador tem todas as permissões', () => {
    expect(ROLE_PERMISSIONS.admin.length).toBeGreaterThan(10)
  })
})

describe('employeeInput', () => {
  const base = {
    registration: '0001',
    fullName: 'Pessoa de Teste',
    cpf: '529.982.247-25',
    hireDate: '2026-01-10',
    contractType: 'clt',
  }
  it('normaliza CPF para dígitos', () => {
    expect(employeeInput.parse(base).cpf).toBe('52998224725')
  })
  it('recusa CPF inválido', () => {
    expect(employeeInput.safeParse({ ...base, cpf: '000' }).success).toBe(false)
  })
  it('converte e-mail vazio em null', () => {
    expect(employeeInput.parse({ ...base, email: '' }).email).toBeNull()
  })
})
