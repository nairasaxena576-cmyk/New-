import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Search,
  Star,
  Save,
  X,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Power,
  Users,
  Settings2,
  Crown,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexBadge } from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';
import { NexInput } from '@/components/ui/nex-input';
import { NexTextarea } from '@/components/ui/nex-textarea';
import {
  NexModal,
  NexModalContent,
  NexModalHeader,
  NexModalFooter,
  NexModalTitle,
  NexModalDescription,
} from '@/components/ui/nex-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { Switch } from '@/components/ui/switch';
import {
  fetchProducts,
  insertProduct,
  updateProduct,
  deleteProduct,
  logActivity,
  fetchAllUserProfiles,
  fetchAllUserLuckySettings,
  adminUpdateUserLuckySettings,
  type ProductRow,
  type UserProfileRow,
  type UserLuckySettingsRow,
} from '@/lib/supabase/deposits';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const fmt = (n: number) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtPct = (n: number) =>
  `${Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}%`;

interface ProductDraft {
  name: string;
  merchant: string;
  price: string;
  category: string;
  category_tint: string;
  image: string;
  min_vip: string;
  is_lucky: boolean;
  lucky_commission_percent: string;
  sort_order: string;
}

const emptyDraft: ProductDraft = {
  name: '',
  merchant: '',
  price: '',
  category: 'general',
  category_tint: 'default',
  image: '',
  min_vip: '0',
  is_lucky: true,
  lucky_commission_percent: '25',
  sort_order: '0',
};

export function AdminLuckyProductsPage() {
  const { user: adminUser } = useAuth();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductRow | null>(null);
  const [draft, setDraft] = useState<ProductDraft>(emptyDraft);
  const [savingForm, setSavingForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [showUserSettings, setShowUserSettings] = useState(false);

  const loadProducts = useCallback(async () => {
    try {
      const rows = await fetchProducts();
      setProducts(rows);
    } catch {
      toast.error('Failed to load products');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
  }, [loadProducts]);

  useEffect(() => {
    const channel = supabase
      .channel('admin-lucky-products-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        loadProducts();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadProducts]);

  const luckyProducts = useMemo(() => products.filter((p) => p.is_lucky), [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return luckyProducts;
    return luckyProducts.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.merchant.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q)
    );
  }, [luckyProducts, search]);

  const kpis = useMemo(() => {
    const count = luckyProducts.length;
    const avg =
      count > 0
        ? luckyProducts.reduce((sum, p) => sum + Number(p.lucky_commission_percent) || 0, 0) / count
        : 0;
    return { count, avg };
  }, [luckyProducts]);

  function openCreate() {
    setEditingProduct(null);
    setDraft(emptyDraft);
    setShowForm(true);
  }

  function openEdit(product: ProductRow) {
    setEditingProduct(product);
    setDraft({
      name: product.name,
      merchant: product.merchant,
      price: String(product.price),
      category: product.category,
      category_tint: product.category_tint,
      image: product.image || '',
      min_vip: String(product.min_vip),
      is_lucky: product.is_lucky,
      lucky_commission_percent: String(product.lucky_commission_percent),
      sort_order: String(product.sort_order),
    });
    setShowForm(true);
  }

  async function handleSaveForm() {
    if (!draft.name.trim() || !draft.merchant.trim()) {
      toast.error('Name and merchant are required');
      return;
    }
    const priceNum = parseFloat(draft.price);
    if (isNaN(priceNum) || priceNum < 0) {
      toast.error('Enter a valid price');
      return;
    }
    const commissionNum = parseFloat(draft.lucky_commission_percent);
    if (isNaN(commissionNum) || commissionNum < 0 || commissionNum > 100) {
      toast.error('Commission must be between 0 and 100');
      return;
    }
    setSavingForm(true);
    try {
      const productData = {
        name: draft.name.trim(),
        merchant: draft.merchant.trim(),
        price: priceNum,
        category: draft.category,
        category_tint: draft.category_tint,
        image: draft.image.trim() || undefined,
        min_vip: parseInt(draft.min_vip) || 0,
        is_lucky: draft.is_lucky,
        lucky_commission_percent: commissionNum,
        sort_order: parseInt(draft.sort_order) || 0,
      };
      if (editingProduct) {
        await updateProduct(editingProduct.id, productData);
        await logActivity('admin', 'edit_lucky_product', 'product', editingProduct.id, `Edited lucky product "${draft.name}"`);
        toast.success('Product updated');
      } else {
        await insertProduct(productData as Omit<ProductRow, 'id'>);
        await logActivity('admin', 'create_lucky_product', 'product', draft.name, `Created lucky product "${draft.name}"`);
        toast.success('Lucky product created');
      }
      setShowForm(false);
      setEditingProduct(null);
      setDraft(emptyDraft);
      await loadProducts();
    } catch (err) {
      toast.error(editingProduct ? 'Failed to update product' : 'Failed to create product', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSavingForm(false);
    }
  }

  async function handleToggleActive(product: ProductRow) {
    try {
      await updateProduct(product.id, { is_lucky: !product.is_lucky });
      await logActivity('admin', 'toggle_lucky_status', 'product', product.id, `${product.is_lucky ? 'Disabled' : 'Enabled'} lucky product "${product.name}"`);
      toast.success(product.is_lucky ? 'Lucky product disabled' : 'Lucky product enabled');
      await loadProducts();
    } catch {
      toast.error('Failed to toggle status');
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProduct(deleteTarget.id);
      await logActivity('admin', 'delete_lucky_product', 'product', deleteTarget.id, `Deleted lucky product "${deleteTarget.name}"`);
      toast.success('Product deleted');
      setDeleteTarget(null);
      await loadProducts();
    } catch (err) {
      toast.error('Failed to delete product', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Lucky Products"
        subtitle="Create, edit, and manage hidden surprise products with per-user commission control."
        action={
          <div className="flex items-center gap-2">
            <NexBadge variant="success" dot>Realtime</NexBadge>
            <NexButton size="sm" onClick={openCreate} leftIcon={<Plus className="size-4" />}>
              Create
            </NexButton>
            <NexButton size="sm" variant="outline" onClick={() => setShowUserSettings(true)} leftIcon={<Users className="size-4" />}>
              User Settings
            </NexButton>
          </div>
        }
      />

      {/* Info card */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <NexCard className="overflow-hidden border-warning/30 bg-gradient-to-br from-warning/10 via-warning/5 to-transparent p-5">
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-warning to-danger text-white shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div className="space-y-1.5">
              <h2 className="text-sm font-semibold text-foreground">How lucky products work</h2>
              <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                Lucky products are hidden from users in the product grid. They are revealed inside assignment
                popups when a user randomly receives one. Each customer can have individual lucky product
                settings (chance, commission, daily limit) managed via the User Settings button or Admin → Users → Manage User.
              </p>
            </div>
          </div>
        </NexCard>
      </motion.div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2">
        {[
          {
            label: 'Lucky Products',
            value: String(kpis.count),
            icon: Star,
            tint: 'from-warning/15 to-warning/5 text-warning',
          },
          {
            label: 'Avg. Lucky Commission',
            value: fmtPct(kpis.avg),
            icon: Sparkles,
            tint: 'from-danger/15 to-danger/5 text-danger',
          },
        ].map((k, i) => {
          const Icon = k.icon;
          return (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 + i * 0.07 }}
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

      {/* Toolbar */}
      <NexCard className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="w-full sm:max-w-xs">
            <NexInput
              placeholder="Search name, merchant, or category..."
              leftIcon={<Search />}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-warning" />
            <span>{filtered.length} shown · {kpis.count} total</span>
          </div>
        </div>
      </NexCard>

      {/* Table */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Star}
          title={search.trim() ? 'No matching lucky products' : 'No lucky products yet'}
          description={
            search.trim()
              ? 'Try a different search term.'
              : 'Click Create to add your first lucky product.'
          }
        />
      ) : (
        <NexCard>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <th className="px-3 py-3">Product</th>
                  <th className="px-3 py-3 text-right">Price</th>
                  <th className="px-3 py-3 text-right">Lucky Commission</th>
                  <th className="px-3 py-3 text-center">Active</th>
                  <th className="px-3 py-3">Created</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((product, i) => (
                  <motion.tr
                    key={product.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.2) }}
                    className="border-b border-border/60 transition-colors hover:bg-muted/30"
                  >
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-10 shrink-0 overflow-hidden rounded-lg bg-muted">
                          {product.image ? (
                            <img src={product.image} alt="" className="size-full object-cover" />
                          ) : (
                            <div className="flex size-full items-center justify-center text-muted-foreground">
                              <Star className="size-4" />
                            </div>
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <Sparkles className="size-3 text-warning" />
                            <p className="truncate font-semibold text-foreground">{product.name}</p>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">{product.merchant} · {product.category}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-foreground">${fmt(product.price)}</td>
                    <td className="px-3 py-3 text-right">
                      <NexBadge variant="warning" size="sm">
                        <Sparkles className="size-2.5" />
                        {fmtPct(Number(product.lucky_commission_percent) || 0)}
                      </NexBadge>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <NexBadge variant={product.is_lucky ? 'success' : 'muted'} size="sm" dot>
                        {product.is_lucky ? 'Active' : 'Inactive'}
                      </NexBadge>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-xs text-muted-foreground">
                      {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <NexButton
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => openEdit(product)}
                          aria-label="Edit product"
                        >
                          <Pencil className="size-3.5" />
                        </NexButton>
                        <NexButton
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleToggleActive(product)}
                          aria-label="Toggle active"
                        >
                          <Power className={cn('size-3.5', product.is_lucky ? 'text-success' : 'text-muted-foreground')} />
                        </NexButton>
                        <NexButton
                          variant="ghost"
                          size="icon-sm"
                          className="text-danger hover:bg-danger/10"
                          onClick={() => setDeleteTarget(product)}
                          aria-label="Delete product"
                        >
                          <Trash2 className="size-3.5" />
                        </NexButton>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </NexCard>
      )}

      {/* Create/Edit Modal */}
      <NexModal open={showForm} onOpenChange={(open) => !open && !savingForm && setShowForm(false)}>
        <NexModalContent className="max-w-lg">
          <NexModalHeader>
            <NexModalTitle className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-lg bg-warning/10 text-warning">
                <Sparkles className="size-4" />
              </span>
              {editingProduct ? 'Edit Lucky Product' : 'Create Lucky Product'}
            </NexModalTitle>
            <NexModalDescription>
              {editingProduct ? 'Update product details and commission settings.' : 'Add a new hidden surprise product to the catalog.'}
            </NexModalDescription>
          </NexModalHeader>

          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Product Name</label>
              <NexInput
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Premium Mystery Box"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Merchant</label>
                <NexInput
                  value={draft.merchant}
                  onChange={(e) => setDraft({ ...draft, merchant: e.target.value })}
                  placeholder="e.g. Amazon"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Price ($)</label>
                <NexInput
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.price}
                  onChange={(e) => setDraft({ ...draft, price: e.target.value })}
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Category</label>
                <NexInput
                  value={draft.category}
                  onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                  placeholder="general"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Min VIP</label>
                <NexInput
                  type="number"
                  min="0"
                  max="3"
                  value={draft.min_vip}
                  onChange={(e) => setDraft({ ...draft, min_vip: e.target.value })}
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Image URL</label>
              <NexInput
                value={draft.image}
                onChange={(e) => setDraft({ ...draft, image: e.target.value })}
                placeholder="https://..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Lucky Commission (%)</label>
                <NexInput
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={draft.lucky_commission_percent}
                  onChange={(e) => setDraft({ ...draft, lucky_commission_percent: e.target.value })}
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Sort Order</label>
                <NexInput
                  type="number"
                  min="0"
                  value={draft.sort_order}
                  onChange={(e) => setDraft({ ...draft, sort_order: e.target.value })}
                />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-muted/20 px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-foreground">Lucky Product Active</p>
                <p className="text-xs text-muted-foreground">Toggle to enable/disable in the system</p>
              </div>
              <Switch
                checked={draft.is_lucky}
                onCheckedChange={(checked) => setDraft({ ...draft, is_lucky: checked })}
              />
            </div>
          </div>

          <NexModalFooter>
            <NexButton variant="outline" onClick={() => setShowForm(false)} disabled={savingForm}>
              Cancel
            </NexButton>
            <NexButton onClick={handleSaveForm} isLoading={savingForm} leftIcon={<Save className="size-4" />}>
              {editingProduct ? 'Save Changes' : 'Create Product'}
            </NexButton>
          </NexModalFooter>
        </NexModalContent>
      </NexModal>

      {/* Delete confirmation */}
      <NexModal open={!!deleteTarget} onOpenChange={(open) => !open && !deleting && setDeleteTarget(null)}>
        <NexModalContent>
          <NexModalHeader>
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-danger/15 text-danger">
                <Trash2 className="size-5" />
              </div>
              <div className="space-y-1.5">
                <NexModalTitle>Delete lucky product?</NexModalTitle>
                <NexModalDescription>
                  This will permanently remove the product from the catalog. This action cannot be undone.
                </NexModalDescription>
              </div>
            </div>
          </NexModalHeader>

          {deleteTarget && (
            <div className="rounded-xl border border-danger/30 bg-danger/5 p-4">
              <div className="flex items-center gap-3">
                <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {deleteTarget.image ? (
                    <img src={deleteTarget.image} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <Star className="size-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{deleteTarget.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {deleteTarget.merchant} · ${fmt(deleteTarget.price)} · {fmtPct(Number(deleteTarget.lucky_commission_percent) || 0)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <NexModalFooter>
            <NexButton variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              Cancel
            </NexButton>
            <NexButton
              variant="danger"
              onClick={handleDelete}
              isLoading={deleting}
              leftIcon={<Trash2 className="size-4" />}
            >
              Delete Product
            </NexButton>
          </NexModalFooter>
        </NexModalContent>
      </NexModal>

      {/* Per-user lucky settings modal */}
      <UserLuckySettingsModal
        open={showUserSettings}
        onOpenChange={setShowUserSettings}
        adminId={adminUser?.id ?? ''}
      />
    </div>
  );
}

function UserLuckySettingsModal({
  open,
  onOpenChange,
  adminId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  adminId: string;
}) {
  const [users, setUsers] = useState<UserProfileRow[]>([]);
  const [settings, setSettings] = useState<UserLuckySettingsRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    lucky_enabled: false,
    lucky_chance_percent: '0',
    lucky_commission_percent: '0',
    lucky_daily_limit: '5',
    lucky_min_price: '',
    lucky_max_price: '',
  });
  const [saving, setSaving] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [u, s] = await Promise.all([fetchAllUserProfiles(), fetchAllUserLuckySettings()]);
      setUsers(u);
      setSettings(s);
    } catch {
      toast.error('Failed to load user data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  const settingsMap = useMemo(() => {
    const map: Record<string, UserLuckySettingsRow> = {};
    for (const s of settings) map[s.user_id] = s;
    return map;
  }, [settings]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.user_id.toLowerCase().includes(q)
    );
  }, [users, search]);

  function startEdit(user: UserProfileRow) {
    const s = settingsMap[user.user_id];
    setEditingUserId(user.user_id);
    if (s) {
      setFormState({
        lucky_enabled: s.lucky_enabled,
        lucky_chance_percent: String(s.lucky_chance_percent),
        lucky_commission_percent: String(s.lucky_commission_percent),
        lucky_daily_limit: String(s.lucky_daily_limit),
        lucky_min_price: s.lucky_min_price != null ? String(s.lucky_min_price) : '',
        lucky_max_price: s.lucky_max_price != null ? String(s.lucky_max_price) : '',
      });
    } else {
      setFormState({
        lucky_enabled: false,
        lucky_chance_percent: '0',
        lucky_commission_percent: '0',
        lucky_daily_limit: '5',
        lucky_min_price: '',
        lucky_max_price: '',
      });
    }
  }

  async function handleSave() {
    if (!editingUserId) return;
    const chance = parseFloat(formState.lucky_chance_percent) || 0;
    const commission = parseFloat(formState.lucky_commission_percent) || 0;
    if (chance < 0 || chance > 100) {
      toast.error('Chance must be 0-100');
      return;
    }
    if (commission < 0 || commission > 100) {
      toast.error('Commission must be 0-100');
      return;
    }
    setSaving(true);
    try {
      await adminUpdateUserLuckySettings({
        adminId,
        userId: editingUserId,
        luckyEnabled: formState.lucky_enabled,
        luckyChancePercent: chance,
        luckyCommissionPercent: commission,
        luckyDailyLimit: parseInt(formState.lucky_daily_limit) || 0,
        luckyMinPrice: formState.lucky_min_price ? parseFloat(formState.lucky_min_price) : null,
        luckyMaxPrice: formState.lucky_max_price ? parseFloat(formState.lucky_max_price) : null,
      });
      toast.success('Settings saved');
      setEditingUserId(null);
      await loadData();
    } catch (err) {
      toast.error('Save failed', { description: err instanceof Error ? err.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <NexModal open={open} onOpenChange={onOpenChange}>
      <NexModalContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <NexModalHeader>
          <NexModalTitle className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Users className="size-4" />
            </span>
            Per-User Lucky Product Settings
          </NexModalTitle>
          <NexModalDescription>
            Configure lucky product chance, commission, and limits for individual customers.
          </NexModalDescription>
        </NexModalHeader>

        <NexInput
          leftIcon={<Search className="size-4" />}
          placeholder="Search users..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="mb-3"
        />

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="max-h-[400px] space-y-2 overflow-y-auto">
            {filtered.map((user) => {
              const s = settingsMap[user.user_id];
              const isEditing = editingUserId === user.user_id;
              return (
                <div
                  key={user.user_id}
                  className={cn(
                    'rounded-xl border p-3 transition-colors',
                    isEditing ? 'border-primary bg-primary/5' : 'border-border bg-muted/20'
                  )}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                        {(user.full_name || user.email || '?').charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-foreground">{user.full_name || 'Unknown'}</p>
                        <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {s && (
                        <NexBadge variant={s.lucky_enabled ? 'success' : 'muted'} size="sm" dot>
                          {s.lucky_enabled ? 'ON' : 'OFF'}
                        </NexBadge>
                      )}
                      {!isEditing && (
                        <NexButton
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(user)}
                          leftIcon={<Settings2 className="size-3" />}
                        >
                          {s ? 'Edit' : 'Configure'}
                        </NexButton>
                      )}
                    </div>
                  </div>

                  {isEditing && (
                    <div className="mt-3 space-y-3 rounded-lg border border-border bg-background p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-muted-foreground">Lucky Enabled</span>
                        <Switch
                          checked={formState.lucky_enabled}
                          onCheckedChange={(checked) => setFormState({ ...formState, lucky_enabled: checked })}
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Chance (%)</label>
                          <NexInput
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={formState.lucky_chance_percent}
                            onChange={(e) => setFormState({ ...formState, lucky_chance_percent: e.target.value })}
                            disabled={!formState.lucky_enabled}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Commission (%)</label>
                          <NexInput
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            value={formState.lucky_commission_percent}
                            onChange={(e) => setFormState({ ...formState, lucky_commission_percent: e.target.value })}
                            disabled={!formState.lucky_enabled}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Daily Limit</label>
                          <NexInput
                            type="number"
                            min="0"
                            value={formState.lucky_daily_limit}
                            onChange={(e) => setFormState({ ...formState, lucky_daily_limit: e.target.value })}
                            disabled={!formState.lucky_enabled}
                            className="h-9"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Min Price (optional)</label>
                          <NexInput
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="None"
                            value={formState.lucky_min_price}
                            onChange={(e) => setFormState({ ...formState, lucky_min_price: e.target.value })}
                            disabled={!formState.lucky_enabled}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-semibold text-muted-foreground">Max Price (optional)</label>
                          <NexInput
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="None"
                            value={formState.lucky_max_price}
                            onChange={(e) => setFormState({ ...formState, lucky_max_price: e.target.value })}
                            disabled={!formState.lucky_enabled}
                            className="h-9"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <NexButton size="sm" variant="ghost" onClick={() => setEditingUserId(null)} disabled={saving}>
                          <X className="size-3" /> Cancel
                        </NexButton>
                        <NexButton size="sm" onClick={handleSave} isLoading={saving} leftIcon={<Save className="size-3" />}>
                          Save
                        </NexButton>
                      </div>
                    </div>
                  )}

                  {s && !isEditing && (
                    <div className="mt-2 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
                      <span>Chance: <span className="font-semibold text-foreground">{fmtPct(Number(s.lucky_chance_percent))}</span></span>
                      <span>Commission: <span className="font-semibold text-foreground">{fmtPct(Number(s.lucky_commission_percent))}</span></span>
                      <span>Limit: <span className="font-semibold text-foreground">{s.lucky_daily_limit}/day</span></span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <NexModalFooter>
          <NexButton variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </NexButton>
        </NexModalFooter>
      </NexModalContent>
    </NexModal>
  );
}
