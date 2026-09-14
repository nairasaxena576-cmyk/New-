import { useEffect, useState, type FormEvent, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ChevronRight, Clock, Loader2, MessageCircle, Paperclip, Plus, Send, Ticket, Upload, X } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexBadge } from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';
import { NexInput } from '@/components/ui/nex-input';
import { NexTextarea } from '@/components/ui/nex-textarea';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/lib/auth';
import { fetchUserTickets, insertTicket, fetchTicketMessages, insertTicketMessage, type SupportMessageRow, type SupportTicketRow } from '@/lib/supabase/deposits';
import { uploadSupportAttachment } from '@/lib/supabase/wallets';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

const categories = [
  ['general', 'General Inquiry'], ['deposit', 'Deposit Issue'], ['withdrawal', 'Withdrawal Issue'], ['order', 'Order Problem'], ['account', 'Account Security'],
] as const;
const statusConfig: Record<string, { label: string; variant: 'warning' | 'success' | 'danger' | 'default' }> = {
  open: { label: 'Open', variant: 'warning' }, pending: { label: 'Pending', variant: 'warning' }, replied: { label: 'Replied', variant: 'success' }, resolved: { label: 'Resolved', variant: 'success' }, closed: { label: 'Closed', variant: 'default' },
};

export function ServicePage() {
  const { user } = useAuth();
  const [tickets, setTickets] = useState<SupportTicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState('general');
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function loadTickets() {
    if (!user) return;
    try { setTickets(await fetchUserTickets(user.id)); } catch (error) { toast.error('Unable to load support tickets', { description: error instanceof Error ? error.message : undefined }); } finally { setLoading(false); }
  }
  useEffect(() => { loadTickets(); }, [user?.id]);
  useEffect(() => {
    if (!user) return;
    const channel = supabase.channel(`customer-support-${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets', filter: `user_id=eq.${user.id}` }, loadTickets).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, loadTickets).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  async function submitTicket(event: FormEvent) {
    event.preventDefault();
    if (!user || !subject.trim() || !message.trim()) return;
    setSubmitting(true);
    try {
      const ticket = await insertTicket({ user_id: user.id, user_email: user.email, user_name: user.fullName, subject: subject.trim(), category, priority: 'normal', message: message.trim() });
      let attachmentUrl: string | null = null;
      if (attachment) attachmentUrl = await uploadSupportAttachment(attachment);
      await insertTicketMessage({ ticket_id: ticket.id, sender: 'user', message: message.trim(), attachment_url: attachmentUrl });
      toast.success('Ticket submitted', { description: 'Your support request is now with the Hawksem team.' });
      setSubject(''); setCategory('general'); setMessage(''); setAttachment(null); setShowForm(false); await loadTickets();
    } catch (error) { toast.error('Could not submit ticket', { description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setSubmitting(false); }
  }

  return <div className="space-y-6">
    <PageHeader title="Support Center" subtitle="Create a ticket and continue the conversation with our team." action={<NexButton leftIcon={<Plus className="size-4" />} onClick={() => setShowForm((value) => !value)}>{showForm ? 'Cancel' : 'Create New Ticket'}</NexButton>} />
    <AnimatePresence>{showForm && <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}><NexCard className="p-5 sm:p-6"><form onSubmit={submitTicket} className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><label className="text-sm font-semibold text-foreground">Subject</label><NexInput required placeholder="Briefly describe your issue" value={subject} onChange={(event) => setSubject(event.target.value)} /></div><div className="space-y-1.5"><label className="text-sm font-semibold text-foreground">Category</label><Select value={category} onValueChange={setCategory}><SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger><SelectContent>{categories.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div></div><div className="space-y-1.5"><label className="text-sm font-semibold text-foreground">Message</label><NexTextarea required rows={5} placeholder="Tell us how we can help" value={message} onChange={(event) => setMessage(event.target.value)} /></div><div className="flex flex-wrap items-center gap-3"><input id="support-file" type="file" accept="image/png,image/jpeg,application/pdf" className="hidden" onChange={(event: ChangeEvent<HTMLInputElement>) => setAttachment(event.target.files?.[0] ?? null)} /><NexButton type="button" variant="outline" size="sm" leftIcon={<Paperclip className="size-4" />} onClick={() => document.getElementById('support-file')?.click()}>Attach screenshot</NexButton>{attachment && <span className="flex items-center gap-2 text-xs text-muted-foreground"><Paperclip className="size-3" />{attachment.name}<button type="button" onClick={() => setAttachment(null)}><X className="size-3" /></button></span>}</div><NexButton type="submit" isLoading={submitting} leftIcon={<Send className="size-4" />}>Submit Ticket</NexButton></form></NexCard></motion.div>}</AnimatePresence>
    <div className="flex items-center justify-between"><div><h2 className="text-lg font-bold text-foreground">Existing Tickets</h2><p className="mt-1 text-sm text-muted-foreground">Your conversations with support</p></div><NexBadge variant="default">{tickets.length} total</NexBadge></div>
    {loading ? <div className="flex h-40 items-center justify-center"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div> : tickets.length === 0 ? <NexCard className="p-8"><EmptyState icon={MessageCircle} title="No tickets yet" description="Create a support ticket and our team will respond here." /></NexCard> : <div className="space-y-3">{tickets.map((ticket) => <TicketThread key={ticket.id} ticket={ticket} userId={user?.id ?? ''} onChanged={loadTickets} />)}</div>}
  </div>;
}

function TicketThread({ ticket, userId, onChanged }: { ticket: SupportTicketRow; userId: string; onChanged: () => Promise<void> }) {
  const [expanded, setExpanded] = useState(false); const [messages, setMessages] = useState<SupportMessageRow[]>([]); const [reply, setReply] = useState(''); const [loading, setLoading] = useState(false); const [sending, setSending] = useState(false);
  const status = statusConfig[ticket.status] ?? statusConfig.open;
  async function open() { setExpanded((value) => !value); if (!expanded) { setLoading(true); try { setMessages(await fetchTicketMessages(ticket.id)); } finally { setLoading(false); } } }
  useEffect(() => { if (!expanded) return; const channel = supabase.channel(`ticket-${ticket.id}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticket.id}` }, async () => setMessages(await fetchTicketMessages(ticket.id))).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_messages', filter: `ticket_id=eq.${ticket.id}` }, async () => setMessages(await fetchTicketMessages(ticket.id))).subscribe(); return () => { supabase.removeChannel(channel); }; }, [expanded, ticket.id]);
  async function sendReply() { if (!reply.trim()) return; setSending(true); try { await insertTicketMessage({ ticket_id: ticket.id, sender: 'user', message: reply.trim() }); setReply(''); await onChanged(); setMessages(await fetchTicketMessages(ticket.id)); } catch (error) { toast.error('Reply failed', { description: error instanceof Error ? error.message : 'Please try again.' }); } finally { setSending(false); } }
  return <NexCard className="overflow-hidden"><button type="button" onClick={open} className="flex w-full items-center justify-between gap-3 p-4 text-left"><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><Ticket className="size-4 shrink-0 text-primary" /><span className="truncate text-sm font-bold text-foreground">{ticket.subject}</span></div><div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><span>#{ticket.id.slice(0, 8).toUpperCase()}</span><span>{ticket.category}</span><span className="flex items-center gap-1"><Clock className="size-3" />{new Date(ticket.updated_at || ticket.created_at).toLocaleDateString()}</span></div></div><div className="flex shrink-0 items-center gap-2"><NexBadge variant={status.variant} size="sm" dot>{status.label}</NexBadge>{expanded ? <ChevronDown className="size-4 text-muted-foreground" /> : <ChevronRight className="size-4 text-muted-foreground" />}</div></button>{expanded && <div className="border-t border-border p-4"><div className="max-h-80 space-y-3 overflow-y-auto">{loading ? <Loader2 className="mx-auto size-5 animate-spin text-muted-foreground" /> : messages.map((item) => <div key={item.id} className={cn('flex', item.sender === 'user' ? 'justify-end' : 'justify-start')}><div className={cn('max-w-[85%] rounded-2xl px-4 py-3 text-sm', item.sender === 'user' ? 'bg-primary text-primary-foreground' : 'border border-border bg-muted/40 text-foreground')}><p className="whitespace-pre-wrap">{item.message}</p>{item.attachment_url && <a className="mt-2 block text-xs underline" href={item.attachment_url} target="_blank" rel="noreferrer">View attachment</a>}<p className="mt-1 text-[10px] opacity-60">{new Date(item.created_at).toLocaleString()}</p></div></div>)}</div>{ticket.status !== 'closed' && <div className="mt-4 flex gap-2"><NexInput placeholder="Reply to support…" value={reply} onChange={(event) => setReply(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && !event.shiftKey && (event.preventDefault(), sendReply())} /><NexButton onClick={sendReply} isLoading={sending} disabled={!reply.trim()}><Send className="size-4" /></NexButton></div>}</div>}</NexCard>;
}
