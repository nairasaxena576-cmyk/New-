import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Loader2,
  MessageSquare,
  Search,
  Send,
  Ticket,
  UserRound,
  Flag,
  StickyNote,
  XCircle,
  Pencil,
  X,
  Save,
  Edit3,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexBadge } from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';
import { NexInput } from '@/components/ui/nex-input';
import { NexTextarea } from '@/components/ui/nex-textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  fetchAllTickets,
  fetchTicketMessagesAdmin,
  adminReplyTicketRpc,
  updateTicketStatusAdminRpc,
  adminEditTicketMessage,
  type SupportMessageRow,
  type SupportTicketRow,
} from '@/lib/supabase/deposits';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

type Status = 'all' | 'open' | 'in_progress' | 'waiting' | 'resolved' | 'closed';
type Priority = 'low' | 'normal' | 'high' | 'urgent';

const statuses: Status[] = ['all', 'open', 'in_progress', 'waiting', 'resolved', 'closed'];

const statusConfig: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' | 'default' | 'secondary' }> = {
  open: { label: 'Open', variant: 'warning' },
  in_progress: { label: 'In Progress', variant: 'secondary' },
  waiting: { label: 'Waiting', variant: 'default' },
  replied: { label: 'Replied', variant: 'success' },
  pending: { label: 'Pending', variant: 'warning' },
  resolved: { label: 'Resolved', variant: 'success' },
  closed: { label: 'Closed', variant: 'default' },
};

const priorityConfig: Record<string, { label: string; variant: 'muted' | 'default' | 'warning' | 'danger' }> = {
  low: { label: 'Low', variant: 'muted' },
  normal: { label: 'Normal', variant: 'default' },
  high: { label: 'High', variant: 'warning' },
  urgent: { label: 'Urgent', variant: 'danger' },
};

const statusOptions: { value: string; label: string }[] = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'waiting', label: 'Waiting for Customer' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

const priorityOptions: { value: Priority; label: string }[] = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

export function AdminTicketsPage() {
  const { user: adminUser } = useAuth();
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SupportMessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<Status>('all');
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const [adminNotes, setAdminNotes] = useState('');
  const [priority, setPriority] = useState<string>('normal');
  const [updatingTicket, setUpdatingTicket] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  async function loadTickets() {
    try {
      const rows = await fetchAllTickets();
      setTickets(rows);
      setSelectedId((current) => (current && rows.some((ticket) => ticket.id === current) ? current : rows[0]?.id ?? null));
    } catch (error) {
      toast.error('Unable to load support tickets', { description: error instanceof Error ? error.message : undefined });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTickets();
  }, []);

  useEffect(() => {
    const channel = supabase
      .channel('admin-support-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, loadTickets)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, loadTickets)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filtered = useMemo(
    () =>
      tickets.filter((ticket) => {
        const query = search.trim().toLowerCase();
        const matchesSearch =
          !query ||
          [ticket.subject, ticket.user_name, ticket.user_email, ticket.category, ticket.id].some((value) =>
            value.toLowerCase().includes(query)
          );
        return matchesSearch && (status === 'all' || ticket.status === status);
      }),
    [tickets, search, status]
  );

  const selected = tickets.find((ticket) => ticket.id === selectedId) ?? null;

  useEffect(() => {
    if (!selected) {
      setMessages([]);
      return;
    }
    fetchTicketMessagesAdmin(selected.id)
      .then(setMessages)
      .catch(() => toast.error('Unable to load conversation'));
    setAdminNotes(selected.admin_notes ?? '');
    setPriority(selected.priority ?? 'normal');
    setEditingMessageId(null);
  }, [selectedId, selected]);

  useEffect(() => {
    if (!selected) return;
    const channel = supabase
      .channel(`admin-ticket-${selected.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${selected.id}` },
        async () => setMessages(await fetchTicketMessagesAdmin(selected.id))
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [selected?.id]);

  async function sendReply() {
    if (!selected || !reply.trim() || !adminUser) return;
    setSending(true);
    try {
      await adminReplyTicketRpc(selected.id, adminUser.id, reply.trim());
      setReply('');
      await loadTickets();
      setMessages(await fetchTicketMessagesAdmin(selected.id));
      toast.success('Reply sent');
    } catch (error) {
      toast.error('Reply failed', { description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(nextStatus: string) {
    if (!selected || !adminUser) return;
    setUpdatingTicket(true);
    try {
      await updateTicketStatusAdminRpc(selected.id, adminUser.id, nextStatus);
      await loadTickets();
      toast.success(`Ticket marked ${nextStatus.replace('_', ' ')}`);
    } catch (error) {
      toast.error('Could not update status', { description: error instanceof Error ? error.message : undefined });
    } finally {
      setUpdatingTicket(false);
    }
  }

  async function saveAdminMeta() {
    if (!selected || !adminUser) return;
    setUpdatingTicket(true);
    try {
      await updateTicketStatusAdminRpc(
        selected.id,
        adminUser.id,
        selected.status,
        priority,
        adminNotes.trim() || undefined
      );
      await loadTickets();
      toast.success('Ticket updated');
    } catch (error) {
      toast.error('Update failed', { description: error instanceof Error ? error.message : undefined });
    } finally {
      setUpdatingTicket(false);
    }
  }

  function startEdit(msg: SupportMessageRow) {
    setEditingMessageId(msg.id);
    setEditText(msg.message);
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setEditText('');
  }

  async function saveEdit(msg: SupportMessageRow) {
    if (!adminUser || !editText.trim()) return;
    setSavingEdit(true);
    try {
      await adminEditTicketMessage(msg.id, adminUser.id, editText.trim());
      setMessages(await fetchTicketMessagesAdmin(selected!.id));
      toast.success('Message edited');
      setEditingMessageId(null);
      setEditText('');
    } catch (error) {
      toast.error('Edit failed', { description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSavingEdit(false);
    }
  }

  const openCount = tickets.filter((ticket) => ticket.status === 'open').length;
  const inProgressCount = tickets.filter((ticket) => ticket.status === 'in_progress').length;
  const resolvedCount = tickets.filter((ticket) => ticket.status === 'resolved').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support Center"
        subtitle="Review customer conversations and respond in real time."
        action={
          <NexBadge variant={openCount ? 'warning' : 'success'} dot>
            {openCount ? `${openCount} new` : 'Up to date'}
          </NexBadge>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon={Ticket} label="Total tickets" value={tickets.length} />
        <Stat icon={Clock} label="Open" value={openCount} />
        <Stat icon={MessageSquare} label="In Progress" value={inProgressCount} />
        <Stat icon={CheckCircle2} label="Resolved" value={resolvedCount} />
      </div>

      <NexCard className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row">
          <NexInput
            leftIcon={<Search className="size-4" />}
            placeholder="Search tickets, customers, or IDs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="lg:max-w-sm"
          />
          <div className="flex flex-wrap gap-2">
            {statuses.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setStatus(item)}
                className={cn(
                  'rounded-lg px-3 py-2 text-xs font-semibold capitalize transition-colors',
                  status === item ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                {item.replace('_', ' ')}
              </button>
            ))}
          </div>
        </div>
      </NexCard>

      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="grid gap-5 lg:grid-cols-5">
          {/* Ticket List */}
          <div className="space-y-2 lg:col-span-2">
            {filtered.length === 0 ? (
              <NexCard className="p-6">
                <EmptyState icon={Ticket} title="No tickets found" description="New customer tickets will appear here automatically." />
              </NexCard>
            ) : (
              filtered.map((ticket) => {
                const config = statusConfig[ticket.status] ?? statusConfig.open;
                const prio = priorityConfig[ticket.priority] ?? priorityConfig.normal;
                const isUnread = ticket.status === 'open';
                return (
                  <button
                    key={ticket.id}
                    type="button"
                    onClick={() => setSelectedId(ticket.id)}
                    className={cn(
                      'w-full rounded-xl border p-4 text-left transition-all',
                      selectedId === ticket.id ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-card hover:border-primary/30'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg', isUnread ? 'bg-warning/15 text-warning' : 'bg-muted text-muted-foreground')}>
                        <UserRound className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <span className="truncate text-sm font-bold text-foreground">{ticket.subject}</span>
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                        </div>
                        <p className="mt-1 truncate text-xs text-muted-foreground">{ticket.user_name || ticket.user_email}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <NexBadge variant={config.variant} size="sm" dot>{config.label}</NexBadge>
                          <NexBadge variant={prio.variant} size="sm">
                            <Flag className="size-2.5" />
                            {prio.label}
                          </NexBadge>
                          <span className="text-[11px] text-muted-foreground">{ticket.category}</span>
                        </div>
                        <p className="mt-2 text-[11px] text-muted-foreground">
                          #{ticket.id.slice(0, 8).toUpperCase()} · {new Date(ticket.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Ticket Detail */}
          <div className="lg:col-span-3">
            {selected ? (
              <NexCard className="overflow-hidden">
                {/* Header */}
                <div className="border-b border-border p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-foreground">{selected.subject}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">{selected.user_name || 'Customer'} · {selected.user_email}</p>
                    </div>
                    <Select value={selected.status} onValueChange={changeStatus} disabled={updatingTicket}>
                      <SelectTrigger className="h-10 w-40 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-3 text-xs text-muted-foreground">
                    <span>Ticket #{selected.id.slice(0, 8).toUpperCase()}</span>
                    <span>{selected.category}</span>
                    <span>Created {new Date(selected.created_at).toLocaleString()}</span>
                    <span>Updated {new Date(selected.updated_at).toLocaleString()}</span>
                    {selected.assigned_admin && <span>Assigned: {selected.assigned_admin}</span>}
                  </div>
                </div>

                {/* Conversation */}
                <div className="max-h-[420px] space-y-3 overflow-y-auto bg-muted/10 p-5">
                  {messages.length === 0 ? (
                    <div className="rounded-xl bg-card p-4 text-sm text-foreground">{selected.message}</div>
                  ) : (
                    messages.map((item) => (
                      <div key={item.id} className={cn('flex', item.sender === 'admin' ? 'justify-end' : 'justify-start')}>
                        <div className={cn('max-w-[85%] rounded-2xl px-4 py-3 text-sm', item.sender === 'admin' ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground')}>
                          {editingMessageId === item.id ? (
                            <div className="space-y-2">
                              <NexTextarea
                                rows={3}
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="bg-background text-foreground"
                              />
                              <div className="flex items-center gap-2">
                                <NexButton
                                  size="sm"
                                  onClick={() => saveEdit(item)}
                                  isLoading={savingEdit}
                                  leftIcon={<Save className="size-3" />}
                                >
                                  Save
                                </NexButton>
                                <NexButton
                                  size="sm"
                                  variant="ghost"
                                  onClick={cancelEdit}
                                  disabled={savingEdit}
                                  leftIcon={<X className="size-3" />}
                                >
                                  Cancel
                                </NexButton>
                              </div>
                            </div>
                          ) : (
                            <>
                              <p className="whitespace-pre-wrap">{item.message}</p>
                              {item.is_edited && (
                                <span className="mt-1 inline-flex items-center gap-1 text-[10px] opacity-70">
                                  <Edit3 className="size-2.5" />
                                  Edited
                                </span>
                              )}
                              {item.attachment_url && (
                                <a href={item.attachment_url} target="_blank" rel="noreferrer" className="mt-2 block text-xs underline">View attachment</a>
                              )}
                              <div className="mt-1 flex items-center justify-between gap-2">
                                <p className="text-[10px] opacity-60">
                                  {item.sender_role === 'admin' ? 'Admin' : 'Customer'} · {new Date(item.created_at).toLocaleString()}
                                </p>
                                {item.sender === 'admin' && editingMessageId !== item.id && (
                                  <button
                                    onClick={() => startEdit(item)}
                                    className="flex items-center gap-1 rounded text-[10px] opacity-60 transition-opacity hover:opacity-100"
                                  >
                                    <Pencil className="size-2.5" />
                                    Edit
                                  </button>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Admin controls */}
                <div className="space-y-4 border-t border-border p-4">
                  {/* Reply */}
                  <div>
                    <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Reply to customer</label>
                    <NexTextarea rows={3} placeholder="Write a reply…" value={reply} onChange={(event) => setReply(event.target.value)} />
                    <NexButton className="mt-2" onClick={sendReply} isLoading={sending} disabled={!reply.trim()} leftIcon={<Send className="size-4" />}>
                      Send Reply
                    </NexButton>
                  </div>

                  {/* Priority + Admin Notes */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Priority</label>
                      <Select value={priority} onValueChange={setPriority}>
                        <SelectTrigger className="h-10 rounded-xl">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {priorityOptions.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Internal Admin Notes (private)</label>
                      <NexTextarea
                        rows={2}
                        placeholder="Internal notes (not visible to customer)..."
                        value={adminNotes}
                        onChange={(event) => setAdminNotes(event.target.value)}
                      />
                    </div>
                  </div>
                  <NexButton variant="outline" size="sm" onClick={saveAdminMeta} isLoading={updatingTicket} leftIcon={<StickyNote className="size-3.5" />}>
                    Save Priority & Notes
                  </NexButton>
                </div>
              </NexCard>
            ) : (
              <NexCard className="flex min-h-[420px] items-center justify-center p-6">
                <EmptyState icon={MessageSquare} title="Select a ticket" description="Open a ticket to read the full conversation." />
              </NexCard>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Ticket; label: string; value: number }) {
  return (
    <NexCard className="p-4">
      <Icon className="size-5 text-primary" />
      <p className="mt-3 text-2xl font-bold text-foreground">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </NexCard>
  );
}
