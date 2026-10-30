import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FileText, IdCard, Info, Milestone, Pencil, Upload } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { Button } from '../components/ui/button'
import { Drawer } from '../components/ui/drawer'
import { Field, Input } from '../components/ui/field'
import { EmptyState, ErrorState, Panel, Skeleton } from '../components/ui/layout'
import { DocumentDrawer, DocumentTable, UploadDocumentDrawer } from '../features/documents'
import { ProfileDetails, ProfileHeader, ProfileHistory } from '../features/employee-profile'
import { api, ApiError } from '../lib/api'
import { useMe } from '../lib/session'
import type { Address, DocumentItem, EmployeeDetail } from '../lib/types'

export function PortalPage() {
  const me = useMe()
  const [editing, setEditing] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [docId, setDocId] = useState<string | null>(null)
  const documents = useQuery({
    queryKey: ['my-documents'],
    queryFn: () => api<DocumentItem[]>('/me/documents'),
    enabled: Boolean(me.employeeId),
  })
  const query = useQuery({
    queryKey: ['me', 'employee'],
    queryFn: () => api<EmployeeDetail>('/me/employee'),
    enabled: Boolean(me.employeeId),
  })

  if (!me.employeeId)
    return (
      <div className="surface">
        <EmptyState icon={IdCard} title="Seu acesso ainda não está ligado a uma ficha">
          Peça ao RH para vincular seu usuário ao seu cadastro de colaborador.
        </EmptyState>
      </div>
    )
  if (query.isError) return <ErrorState error={query.error} onRetry={() => query.refetch()} />
  if (query.isPending) return <Skeleton className="h-72 rounded-xl" />

  const employee = query.data
  return (
    <>
      <ProfileHeader
        employee={employee}
        actions={
          <Button variant="primary" onClick={() => setEditing(true)}>
            <Pencil className="size-4" aria-hidden /> Atualizar meus contatos
          </Button>
        }
      />
      <div className="flex flex-col gap-5">
        <ProfileDetails employee={employee} />
        <Panel
          title="Meus documentos"
          icon={FileText}
          aside={
            <Button size="sm" onClick={() => setUploading(true)}>
              <Upload className="size-4" aria-hidden /> Enviar
            </Button>
          }
          bodyClassName="p-0"
        >
          <DocumentTable bare rows={documents.data ?? []} loading={documents.isPending} onOpen={setDocId} showEmployee={false} empty="Nenhum documento no seu cadastro" />
        </Panel>
        <Panel title="Minha trajetória" icon={Milestone}>
          <ProfileHistory history={employee.history} />
        </Panel>
        <p className="flex items-center gap-2.5 rounded-md border border-line bg-paper px-4 py-3 text-sm text-steel shadow-xs">
          <Info className="size-4 shrink-0 text-info" aria-hidden />
          Encontrou algo errado no cargo, departamento ou datas? Fale com o RH: esses dados só mudam por lá.
        </p>
      </div>
      <ContactDrawer open={editing} onOpenChange={setEditing} employee={employee} />
      <UploadDocumentDrawer open={uploading} onOpenChange={setUploading} mode="self" />
      <DocumentDrawer id={docId} onClose={() => setDocId(null)} />
    </>
  )
}

function ContactDrawer({
  open,
  onOpenChange,
  employee,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: EmployeeDetail
}) {
  const queryClient = useQueryClient()
  const [phone, setPhone] = useState(employee.phone ?? '')
  const [email, setEmail] = useState(employee.email ?? '')
  const [socialName, setSocialName] = useState(employee.socialName ?? '')
  const [address, setAddress] = useState<Address>(employee.address ?? {})
  const setAddr = (key: keyof Address) => (e: { target: { value: string } }) => setAddress({ ...address, [key]: e.target.value })

  const save = useMutation({
    mutationFn: () =>
      api('/me/employee', {
        method: 'PATCH',
        body: { phone, email: email || null, socialName, address },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['me', 'employee'] })
      toast.success('Contatos atualizados.')
      onOpenChange(false)
    },
    onError: error => toast.error(error instanceof ApiError ? error.message : 'Não foi possível salvar.'),
  })
  const submit = (e: FormEvent) => {
    e.preventDefault()
    save.mutate()
  }

  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Meus contatos"
      description="O RH é avisado pelo histórico de cada alteração."
      footer={
        <>
          <Button onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button variant="primary" onClick={submit} loading={save.isPending}>Salvar contatos</Button>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-6">
        <Field label="Nome social" className="sm:col-span-6" hint="Deixe em branco para usar o nome civil.">
          {p => <Input {...p} value={socialName} onChange={e => setSocialName(e.target.value)} />}
        </Field>
        <Field label="Telefone" className="sm:col-span-3">{p => <Input {...p} type="tel" value={phone} onChange={e => setPhone(e.target.value)} />}</Field>
        <Field label="E-mail" className="sm:col-span-3">{p => <Input {...p} type="email" value={email} onChange={e => setEmail(e.target.value)} />}</Field>
        <Field label="CEP" className="sm:col-span-2">{p => <Input {...p} inputMode="numeric" value={address.zip ?? ''} onChange={setAddr('zip')} />}</Field>
        <Field label="Rua" className="sm:col-span-4">{p => <Input {...p} value={address.street ?? ''} onChange={setAddr('street')} />}</Field>
        <Field label="Número" className="sm:col-span-2">{p => <Input {...p} value={address.number ?? ''} onChange={setAddr('number')} />}</Field>
        <Field label="Complemento" className="sm:col-span-4">{p => <Input {...p} value={address.complement ?? ''} onChange={setAddr('complement')} />}</Field>
        <Field label="Bairro" className="sm:col-span-3">{p => <Input {...p} value={address.district ?? ''} onChange={setAddr('district')} />}</Field>
        <Field label="Cidade" className="sm:col-span-2">{p => <Input {...p} value={address.city ?? ''} onChange={setAddr('city')} />}</Field>
        <Field label="UF" className="sm:col-span-1">{p => <Input {...p} maxLength={2} value={address.state ?? ''} onChange={setAddr('state')} />}</Field>
        <button type="submit" hidden />
      </form>
    </Drawer>
  )
}
