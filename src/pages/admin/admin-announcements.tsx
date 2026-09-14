import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Megaphone, Plus, Pencil, Trash2, Loader2, AlertTriangle, Info, CheckCircle2, AlertCircle, XCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexCardHeader, NexCardTitle, NexCardContent, NexBadge } from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';
import { NexInput } from '@/components/ui/nex-input';
import { NexTextarea } from '@/components/ui/nex-textarea';
import { NexModal, NexModalContent, NexModalHeader, NexModalFooter, NexModalTitle, NexModalDescription } from '@/components/ui/nex-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { fetchAnnouncements, insertAnnouncement, updateAnnouncement, deleteAnnouncement, logActivity, type AnnouncementRow } from '@/lib/supabase/deposits';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type AnnouncementType = AnnouncementRow['type'];

interface AnnouncementFormData {
  title: string;
  body: string;
  type: AnnouncementType;
  is_active: boolean;
  sort_order: number;
}

const EMPTY_FORM: AnnouncementFormData = {
  title: '',
  body: '',
  type: 'info',
  is_active: true,
  sort_order: 0,
};

const TYPE_OPTIONS: {
  value: AnnouncementType;
  label: string;
  icon: typeof Info;
  activeClass: string;
  idleClass: string;
  badgeVariant: 'default' | 'success' | 'warning' | 'danger';
}[] = [
  {
    value: 'info',
    label: 'Info',
    icon: Info,
    activeClass: 'border-primary bg-primary/10 text-primary',
    idleClass: 'border-border bg-card text-muted-foreground hover:bg-accent',
    badgeVariant: 'default',
  },
  {
    value: 'success',
    label: 'Success',
    icon: CheckCircle2,
    activeClass: 'border-success bg-success/10 text-success',
    idleClass: 'border-border bg-card text-muted-foreground hover:bg-accent',
    badgeVariant: 'success',
  },
  {
    value: 'warning',
    label: 'Warning',
    icon: AlertCircle,
    activeClass: 'border-warning bg-warning/15 text-warning',
    idleClass: 'border-border bg-card text-muted-foreground hover:bg-accent',
    badgeVariant: 'warning',
  },
  {
    value: 'danger',
    label: 'Danger',
    icon: XCircle,
    activeClass: 'border-danger bg-danger/10 text-danger',
    idleClass: 'border-border bg-card text-muted-foreground hover:bg-accent',
    badgeVariant: 'danger',
  },
];

function typeMeta(type: AnnouncementType) {
  return TYPE_OPTIONS.find((t) => t.value === type) ?? TYPE_OPTIONS[0];
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<AnnouncementRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<AnnouncementFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<AnnouncementRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const loadAnnouncements = useCallback(async () => {
    try {
      const rows = await fetchAnnouncements();
      setAnnouncements(rows);
    } catch {
      toast.error('Failed to load announcements');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin-announcements-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, () => {
        loadAnnouncements();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadAnnouncements]);

  const activeCount = announcements.filter((a) => a.is_active).length;

  const kpis = [
    {
      label: 'Total Announcements',
      value: String(announcements.length),
      icon: Megaphone,
      tint: 'from-primary/10 to-primary/5 text-primary',
    },
    {
      label: 'Active',
      value: String(activeCount),
      icon: ToggleRight,
      tint: 'from-success/10 to-success/5 text-success',
    },
    {
      label: 'Inactive',
      value: String(announcements.length - activeCount),
      icon: ToggleLeft,
      tint: 'from-secondary/10 to-secondary/5 text-secondary',
    },
  ];

  function openAdd() {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(announcement: AnnouncementRow) {
    setEditingId(announcement.id);
    setFormData({
      title: announcement.title ?? '',
      body: announcement.body ?? '',
      type: announcement.type ?? 'info',
      is_active: !!announcement.is_active,
      sort_order: Number(announcement.sort_order) || 0,
    });
    setFormOpen(true);
  }

  async function handleSubmit() {
    if (!formData.title.trim()) {
      toast.error('Title is required');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateAnnouncement(editingId, formData);
        await logActivity(
          'admin',
          'update_announcement',
          'announcement',
          editingId,
          `Updated announcement "${formData.title}"`
        );
        toast.success('Announcement updated', { description: formData.title });
      } else {
        await insertAnnouncement(formData);
        await logActivity(
          'admin',
          'create_announcement',
          'announcement',
          '',
          `Created announcement "${formData.title}"`
        );
        toast.success('Announcement created', { description: formData.title });
      }
      setFormOpen(false);
      await loadAnnouncements();
    } catch (err) {
      toast.error(editingId ? 'Failed to update announcement' : 'Failed to create announcement', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(announcement: AnnouncementRow) {
    setTogglingId(announcement.id);
    const next = !announcement.is_active;
    // Optimistic update
    setAnnouncements((prev) =>
      prev.map((a) => (a.id === announcement.id ? { ...a, is_active: next } : a))
    );
    try {
      await updateAnnouncement(announcement.id, { is_active: next });
      await logActivity(
        'admin',
        'toggle_announcement',
        'announcement',
        announcement.id,
        `${next ? 'Activated' : 'Deactivated'} announcement "${announcement.title}"`
      );
      toast.success(next ? 'Announcement activated' : 'Announcement deactivated', {
        description: announcement.title,
      });
    } catch (err) {
      // Revert on failure
      setAnnouncements((prev) =>
        prev.map((a) => (a.id === announcement.id ? { ...a, is_active: !next } : a))
      );
      toast.error('Failed to toggle announcement', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAnnouncement(deleteTarget.id);
      await logActivity(
        'admin',
        'delete_announcement',
        'announcement',
        deleteTarget.id,
        `Deleted announcement "${deleteTarget.title}"`
      );
      toast.success('Announcement deleted', { description: deleteTarget.title });
      setDeleteTarget(null);
      await loadAnnouncements();
    } catch (err) {
      toast.error('Failed to delete announcement', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Announcement Management"
        subtitle="Create, edit, and manage announcements displayed to users."
        action={
          <div className="flex items-center gap-2">
            <NexBadge variant="success" dot>Realtime</NexBadge>
            <NexButton leftIcon={<Plus className="size-4" />} onClick={openAdd}>
              Add Announcement
            </NexButton>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        {kpis.map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
            >
              <NexCard className="p-5">
                <div className={cn('flex size-11 items-center justify-center rounded-xl bg-gradient-to-br', k.tint)}>
                  <Icon className="size-5" />
                </div>
                <p className="mt-4 text-2xl font-bold tracking-tight text-foreground">{k.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{k.label}</p>
              </NexCard>
            </motion.div>
          );
        })}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : announcements.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Add your first announcement to start broadcasting updates to users."
          action={
            <NexButton leftIcon={<Plus className="size-4" />} onClick={openAdd}>
              Add Announcement
            </NexButton>
          }
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {announcements.map((announcement, i) => (
              <motion.div
                key={announcement.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.2) }}
              >
                <AnnouncementListItem
                  announcement={announcement}
                  onEdit={() => openEdit(announcement)}
                  onDelete={() => setDeleteTarget(announcement)}
                  onToggle={() => handleToggleActive(announcement)}
                  toggling={togglingId === announcement.id}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Add / Edit modal */}
      <NexModal open={formOpen} onOpenChange={(open) => !open && setFormOpen(false)}>
        <NexModalContent className="max-w-2xl">
          <NexModalHeader>
            <NexModalTitle>{editingId ? 'Edit Announcement' : 'Add Announcement'}</NexModalTitle>
            <NexModalDescription>
              {editingId
                ? 'Update the details of this announcement.'
                : 'Fill in the details to create a new announcement.'}
            </NexModalDescription>
          </NexModalHeader>

          <div className="space-y-5">
            {/* Section: Content */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Content
              </p>
              <Field label="Title" required>
                <NexInput
                  value={formData.title}
                  onChange={(e) => setFormData((d) => ({ ...d, title: e.target.value }))}
                  placeholder="e.g. Scheduled Maintenance"
                  className="h-10"
                />
              </Field>
              <Field label="Body">
                <NexTextarea
                  value={formData.body}
                  onChange={(e) => setFormData((d) => ({ ...d, body: e.target.value }))}
                  placeholder="Write the announcement message..."
                  className="min-h-[120px]"
                />
              </Field>
            </div>

            {/* Section: Type */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Type
              </p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TYPE_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = formData.type === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setFormData((d) => ({ ...d, type: opt.value }))}
                      className={cn(
                        'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold transition-all',
                        selected ? opt.activeClass : opt.idleClass
                      )}
                    >
                      <Icon className="size-4" />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Section: Status & ordering */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Status & Ordering
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Sort Order">
                  <NexInput
                    type="number"
                    min={0}
                    value={formData.sort_order}
                    onChange={(e) =>
                      setFormData((d) => ({ ...d, sort_order: Number(e.target.value) || 0 }))
                    }
                    className="h-10"
                  />
                </Field>
                <div className="flex items-end pb-1">
                  <div className="flex w-full items-center justify-between rounded-xl border border-border bg-muted/30 px-4 py-2.5">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-foreground">Active</span>
                      <span className="text-[11px] text-muted-foreground">
                        {formData.is_active ? 'Visible to users' : 'Hidden from users'}
                      </span>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={formData.is_active}
                      onClick={() =>
                        setFormData((d) => ({ ...d, is_active: !d.is_active }))
                      }
                      className={cn(
                        'relative h-6 w-11 rounded-full transition-colors',
                        formData.is_active ? 'bg-success' : 'bg-muted-foreground/30'
                      )}
                    >
                      <motion.span
                        layout
                        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                        className={cn(
                          'absolute top-0.5 size-5 rounded-full bg-white shadow-sm',
                          formData.is_active ? 'left-[1.375rem]' : 'left-0.5'
                        )}
                      />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <NexModalFooter>
            <NexButton variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </NexButton>
            <NexButton onClick={handleSubmit} isLoading={saving}>
              {editingId ? 'Save Changes' : 'Create Announcement'}
            </NexButton>
          </NexModalFooter>
        </NexModalContent>
      </NexModal>

      {/* Delete confirmation */}
      <NexModal open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <NexModalContent>
          <NexModalHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger/10 text-danger">
                <AlertTriangle className="size-5" />
              </div>
              <div className="space-y-1.5">
                <NexModalTitle>Delete announcement?</NexModalTitle>
                <NexModalDescription>
                  This action cannot be undone. The announcement will be permanently removed.
                </NexModalDescription>
              </div>
            </div>
          </NexModalHeader>

          {deleteTarget && (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  {(() => {
                    const Icon = typeMeta(deleteTarget.type).icon;
                    return <Icon className="size-5" />;
                  })()}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{deleteTarget.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {typeMeta(deleteTarget.type).label} · #{deleteTarget.sort_order}
                  </p>
                </div>
              </div>
            </div>
          )}

          <NexModalFooter>
            <NexButton variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </NexButton>
            <NexButton variant="danger" onClick={handleDelete} isLoading={deleting} leftIcon={<Trash2 className="size-4" />}>
              Delete Announcement
            </NexButton>
          </NexModalFooter>
        </NexModalContent>
      </NexModal>
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-foreground">
        {label}
        {required && <span className="ml-0.5 text-danger">*</span>}
      </label>
      {children}
    </div>
  );
}

function AnnouncementListItem({
  announcement,
  onEdit,
  onDelete,
  onToggle,
  toggling,
}: {
  announcement: AnnouncementRow;
  onEdit: () => void;
  onDelete: () => void;
  onToggle: () => void;
  toggling: boolean;
}) {
  const meta = typeMeta(announcement.type);
  const TypeIcon = meta.icon;

  return (
    <NexCard className="overflow-hidden">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
        {/* Left: icon + content */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div
            className={cn(
              'flex size-11 shrink-0 items-center justify-center rounded-xl',
              announcement.type === 'info' && 'bg-primary/10 text-primary',
              announcement.type === 'success' && 'bg-success/10 text-success',
              announcement.type === 'warning' && 'bg-warning/15 text-warning',
              announcement.type === 'danger' && 'bg-danger/10 text-danger'
            )}
          >
            <TypeIcon className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="line-clamp-1 text-sm font-semibold text-foreground">
                {announcement.title}
              </h3>
              <NexBadge variant={meta.badgeVariant} size="sm">
                {meta.label}
              </NexBadge>
            </div>
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
              {announcement.body || 'No body provided.'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <span className="font-medium text-foreground/70">#{announcement.sort_order}</span>
                sort
              </span>
              <span className="text-border">·</span>
              <span>{formatDate(announcement.created_at)}</span>
            </div>
          </div>
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-2 sm:shrink-0">
          {/* Active toggle */}
          <button
            type="button"
            onClick={onToggle}
            disabled={toggling}
            aria-label={announcement.is_active ? 'Deactivate announcement' : 'Activate announcement'}
            title={announcement.is_active ? 'Active — click to deactivate' : 'Inactive — click to activate'}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50',
              announcement.is_active
                ? 'text-success hover:bg-success/10'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {toggling ? (
              <Loader2 className="size-5 animate-spin" />
            ) : announcement.is_active ? (
              <ToggleRight className="size-6" />
            ) : (
              <ToggleLeft className="size-6" />
            )}
            <span className={cn('hidden sm:inline', announcement.is_active ? 'text-success' : 'text-muted-foreground')}>
              {announcement.is_active ? 'Active' : 'Inactive'}
            </span>
          </button>

          <NexButton variant="outline" size="sm" leftIcon={<Pencil className="size-3.5" />} onClick={onEdit}>
            Edit
          </NexButton>
          <NexButton variant="ghost" size="icon-sm" className="text-danger hover:bg-danger/10" onClick={onDelete}>
            <Trash2 className="size-4" />
          </NexButton>
        </div>
      </div>
    </NexCard>
  );
}
