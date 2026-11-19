import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateTimeIST } from '@/lib/format';
import { useBranches, useDebounced } from '@/lib/hooks';
import { Button } from '@/components/ui/Button';
import { Field, Input, inputCls } from '@/components/ui/Field';
import { Modal } from '@/components/ui/Modal';

const ROLE_TEXT: Record<string, string> = { ADMIN: 'Admin', OWNER: 'Owner', STAFF: 'Sales staff' };

export function StaffPage() {
  const qc = useQueryClient(), { data: branches } = useBranches(), [q, setQ] = useState(''), [page, setPage] = useState(1), [editing, setEditing] = useState<any | 'new' | null>(null), dq = useDebounced(q);
  const list = useQuery({ queryKey: ['users', dq, page], queryFn: () => api('/users', { query: { q: dq, page, limit: 20 } }), placeholderData: keepPreviousData });
  const items: any[] = list.data?.items ?? [], pages = Math.max(1, Math.ceil((list.data?.total ?? 0) / 20));
  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="flex items-center justify-between gap-3"><h1 className="font-display text-2xl">Staff</h1><Button variant="primary" onClick={() => setEditing('new')}>Add staff</Button></div>
      <Input className="mt-4 max-w-xs" placeholder="Search name or mobile" aria-label="Search staff" value={q} onChange={e => { setQ(e.target.value); setPage(1); }} />
      <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-paper">
        <table className="w-full text-sm">
          <thead><tr className="border-b border-line text-left text-muted"><th className="p-3 font-medium">Name</th><th className="p-3 font-medium">Role</th><th className="p-3 font-medium">Branches</th><th className="p-3 font-medium">Last sign-in</th></tr></thead>
          <tbody>{items.map(u => (
            <tr key={u._id} className="cursor-pointer border-b border-line last:border-0 hover:bg-gold-wash" onClick={() => setEditing(u)}>
              <td className="p-3"><div className="font-medium">{u.name}{u.active === false && <span className="ml-2 rounded bg-canvas px-1.5 text-xs text-muted">stopped</span>}</div><div className="text-xs text-muted">{u.mobile}</div></td>
              <td className="p-3">{ROLE_TEXT[u.role]}</td>
              <td className="p-3 text-muted">{u.role === 'ADMIN' ? 'All branches' : u.branchIds.map((id: string) => branches?.find(b => b._id === id)?.name ?? '…').join(', ')}</td>
              <td className="p-3 whitespace-nowrap text-muted">{u.lastLoginAt ? dateTimeIST(u.lastLoginAt) : 'never'}</td></tr>))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-sm text-muted"><span>{list.data?.total ?? 0} people</span>
        <span className="flex items-center gap-2"><Button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</Button>Page {page} of {pages}<Button disabled={page >= pages} onClick={() => setPage(p => p + 1)}>Next</Button></span></div>
      {editing && <StaffForm user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { qc.invalidateQueries({ queryKey: ['users'] }); setEditing(null); }} />}
    </div>
  );
}

function StaffForm({ user, onClose, onSaved }: { user: any | null; onClose: () => void; onSaved: () => void }) {
  const me = useAuth(s => s.user!), { data: branches } = useBranches(), self = user?._id === me.id;
  const [name, setName] = useState(user?.name ?? ''), [mobile, setMobile] = useState(user?.mobile ?? ''), [role, setRole] = useState(user?.role ?? 'STAFF');
  const [bids, setBids] = useState<string[]>(user?.branchIds ?? []), [password, setPassword] = useState(''), [active, setActive] = useState(user?.active !== false);
  const toggle = (id: string) => setBids(b => (b.includes(id) ? b.filter(x => x !== id) : [...b, id]));
  const needsBranch = role !== 'ADMIN';
  const valid = name.trim().length >= 2 && (user || /^[6-9]\d{9}$/.test(mobile)) && (!needsBranch || bids.length > 0) && (user ? password === '' || password.length >= 8 : password.length >= 8);
  const save = useMutation({
    mutationFn: () => user
      ? api(`/users/${user._id}`, { method: 'PATCH', body: { name: name.trim(), role, ...(needsBranch && { branchIds: bids }), active, ...(password && { password }) } })
      : api('/users', { body: { name: name.trim(), mobile, password, role, ...(needsBranch && { branchIds: bids }) } }),
    onSuccess: onSaved,
  });
  return (
    <Modal title={user ? `Edit ${user.name}` : 'Add staff'} onClose={onClose}>
      <form className="space-y-4" onSubmit={e => { e.preventDefault(); save.mutate(); }}>
        <Field label="Name"><Input autoFocus value={name} onChange={e => setName(e.target.value)} /></Field>
        <Field label="Mobile number (used to sign in)">{user ? <div className="text-sm">{user.mobile}</div> : <Input inputMode="numeric" maxLength={10} value={mobile} onChange={e => setMobile(e.target.value.replace(/\D/g, ''))} />}</Field>
        <Field label="Role" hint={role === 'STAFF' ? 'Makes bills and collects instalments; sees only their own bills.' : role === 'OWNER' ? 'Runs a branch: stock, purchases, transfers, credit notes, reports.' : 'Everything, across all branches.'}>
          <select disabled={self} className={inputCls} value={role} onChange={e => setRole(e.target.value)}><option value="STAFF">Sales staff</option><option value="OWNER">Owner (branch)</option><option value="ADMIN">Admin</option></select></Field>
        {needsBranch && (
          <fieldset className="text-sm"><legend className="mb-1 font-medium">Works at</legend>
            {branches?.map(b => <label key={b._id} className="mr-4 inline-flex items-center gap-2"><input type="checkbox" checked={bids.includes(b._id)} onChange={() => toggle(b._id)} />{b.name}</label>)}</fieldset>)}
        <Field label={user ? 'New password (leave empty to keep)' : 'Password'} hint="At least 8 characters. Changing it signs the person out everywhere."><Input type="password" autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} /></Field>
        {user && !self && <label className="flex gap-2 text-sm"><input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} /> Can sign in</label>}
        {save.error && <p className="text-sm text-danger" role="alert">{(save.error as Error).message}</p>}
        <Button type="submit" variant="primary" className="w-full" busy={save.isPending} disabled={!valid}>{user ? 'Save changes' : 'Add'}</Button>
      </form>
    </Modal>);
}
