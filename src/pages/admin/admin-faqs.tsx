import { useEffect, useState, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HelpCircle, Plus, Pencil, Trash2, Loader2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexBadge } from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';
import { NexInput } from '@/components/ui/nex-input';
import { NexTextarea } from '@/components/ui/nex-textarea';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  fetchAllFaqs,
  insertFaq,
  updateFaq,
  deleteFaq,
  type FaqRow,
} from '@/lib/supabase/deposits';
import { cn } from '@/lib/utils';

const categories = [
  { value: 'general', label: 'General' },
  { value: 'account', label: 'Account' },
  { value: 'vip', label: 'VIP' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'security', label: 'Security' },
];

export function AdminFaqsPage() {
  const [faqs, setFaqs] = useState<FaqRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [category, setCategory] = useState('general');
  const [sortOrder, setSortOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadFaqs() {
    try {
      const rows = await fetchAllFaqs();
      setFaqs(rows);
    } catch {
      // keep empty
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFaqs();
  }, []);

  function resetForm() {
    setQuestion('');
    setAnswer('');
    setCategory('general');
    setSortOrder(0);
    setIsActive(true);
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(faq: FaqRow) {
    setEditingId(faq.id);
    setQuestion(faq.question);
    setAnswer(faq.answer);
    setCategory(faq.category);
    setSortOrder(faq.sort_order);
    setIsActive(faq.is_active);
    setShowForm(true);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!question.trim() || !answer.trim()) return;
    setSubmitting(true);
    try {
      if (editingId) {
        await updateFaq(editingId, {
          question: question.trim(),
          answer: answer.trim(),
          category,
          sort_order: sortOrder,
          is_active: isActive,
        });
        toast.success('FAQ updated');
      } else {
        await insertFaq({
          question: question.trim(),
          answer: answer.trim(),
          category,
          sort_order: sortOrder,
          is_active: isActive,
        });
        toast.success('FAQ created');
      }
      resetForm();
      await loadFaqs();
    } catch (err) {
      toast.error('Failed to save', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteFaq(id);
      toast.success('FAQ deleted');
      await loadFaqs();
    } catch (err) {
      toast.error('Failed to delete', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    }
  }

  async function toggleActive(faq: FaqRow) {
    try {
      await updateFaq(faq.id, { is_active: !faq.is_active });
      await loadFaqs();
    } catch {
      toast.error('Failed to update');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="FAQ Management"
        subtitle="Create and manage frequently asked questions shown to users."
        action={
          <NexButton
            size="sm"
            leftIcon={showForm ? <Check className="size-4" /> : <Plus className="size-4" />}
            onClick={() => {
              if (showForm) resetForm();
              else setShowForm(true);
            }}
          >
            {showForm ? 'Cancel' : 'Add FAQ'}
          </NexButton>
        }
      />

      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <NexCard className="p-5">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">Question</label>
                  <NexInput
                    placeholder="What is…?"
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">Answer</label>
                  <NexTextarea
                    placeholder="Detailed answer…"
                    value={answer}
                    onChange={(e) => setAnswer(e.target.value)}
                    rows={3}
                    required
                  />
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground">Category</label>
                    <Select value={category} onValueChange={setCategory}>
                      <SelectTrigger className="h-12 rounded-xl"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground">Sort Order</label>
                    <NexInput
                      type="number"
                      value={sortOrder}
                      onChange={(e) => setSortOrder(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-foreground">Active</label>
                    <button
                      type="button"
                      onClick={() => setIsActive((s) => !s)}
                      className={cn(
                        'flex h-12 w-full items-center justify-between rounded-xl border px-4 text-sm font-medium',
                        isActive ? 'border-success/30 bg-success/5 text-success' : 'border-border text-muted-foreground'
                      )}
                    >
                      {isActive ? 'Visible' : 'Hidden'}
                      <span className={cn('flex size-5 items-center justify-center rounded-full border-2', isActive ? 'border-success bg-success' : 'border-border')}>
                        {isActive && <Check className="size-3 text-white" />}
                      </span>
                    </button>
                  </div>
                </div>
                <NexButton type="submit" className="w-full" isLoading={submitting}>
                  {editingId ? 'Update FAQ' : 'Create FAQ'}
                </NexButton>
              </form>
            </NexCard>
          </motion.div>
        )}
      </AnimatePresence>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : faqs.length === 0 ? (
        <NexCard className="p-6">
          <EmptyState icon={HelpCircle} title="No FAQs yet" description="Create your first FAQ entry." />
        </NexCard>
      ) : (
        <div className="space-y-2">
          {faqs.map((faq, i) => (
            <motion.div
              key={faq.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
            >
              <NexCard className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                        {faq.category}
                      </span>
                      <NexBadge variant={faq.is_active ? 'success' : 'default'} size="sm">
                        {faq.is_active ? 'Active' : 'Hidden'}
                      </NexBadge>
                    </div>
                    <p className="mt-2 text-sm font-semibold text-foreground">{faq.question}</p>
                    <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{faq.answer}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => toggleActive(faq)}
                      className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent"
                      title={faq.is_active ? 'Hide' : 'Show'}
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      onClick={() => startEdit(faq)}
                      className="flex size-8 items-center justify-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-accent"
                    >
                      <Pencil className="size-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(faq.id)}
                      className="flex size-8 items-center justify-center rounded-lg border border-danger/20 text-danger transition-colors hover:bg-danger/10"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </div>
              </NexCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
