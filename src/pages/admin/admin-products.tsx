import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Search, Plus, Pencil, Trash2, Loader2, Star, AlertTriangle, X } from 'lucide-react';
import { PageHeader } from '@/components/shared/page-header';
import { NexCard, NexBadge } from '@/components/ui/nex';
import { NexButton } from '@/components/ui/nex-button';
import { NexInput } from '@/components/ui/nex-input';
import { NexTextarea } from '@/components/ui/nex-textarea';
import { NexModal, NexModalContent, NexModalHeader, NexModalFooter, NexModalTitle, NexModalDescription } from '@/components/ui/nex-modal';
import { EmptyState } from '@/components/ui/empty-state';
import { fetchProducts, insertProduct, updateProduct, deleteProduct, logActivity, type ProductRow } from '@/lib/supabase/deposits';
import { supabase } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Filter = 'all' | 'lucky' | 'non-lucky';

const CATEGORY_TINTS = ['default', 'secondary', 'warning', 'success'] as const;
type CategoryTint = (typeof CATEGORY_TINTS)[number];

const tintBadgeVariant: Record<CategoryTint, 'default' | 'secondary' | 'warning' | 'success'> = {
  default: 'default',
  secondary: 'secondary',
  warning: 'warning',
  success: 'success',
};

interface ProductFormData {
  name: string;
  merchant: string;
  price: number;
  category: string;
  category_tint: CategoryTint;
  image: string;
  min_vip: number;
  is_lucky: boolean;
  lucky_commission_percent: number;
  sort_order: number;
}

const EMPTY_FORM: ProductFormData = {
  name: '',
  merchant: '',
  price: 0,
  category: '',
  category_tint: 'default',
  image: '',
  min_vip: 0,
  is_lucky: false,
  lucky_commission_percent: 0,
  sort_order: 0,
};

const fmt = (n: number) =>
  Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function AdminProductsPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProductFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('admin-products-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, () => {
        loadProducts();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadProducts]);

  const filtered = useMemo(() => {
    let result = products;
    if (filter === 'lucky') result = result.filter((p) => p.is_lucky);
    if (filter === 'non-lucky') result = result.filter((p) => !p.is_lucky);
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.merchant.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    }
    return result;
  }, [products, search, filter]);

  const luckyCount = products.filter((p) => p.is_lucky).length;

  const kpis = [
    { label: 'Total Services', value: String(products.length), icon: Package, tint: 'from-primary/10 to-primary/5 text-primary' },
    { label: 'Lucky Products', value: String(luckyCount), icon: Star, tint: 'from-warning/10 to-warning/5 text-warning' },
    { label: 'Standard Products', value: String(products.length - luckyCount), icon: Package, tint: 'from-secondary/10 to-secondary/5 text-secondary' },
  ];

  function openAdd() {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormOpen(true);
  }

  function openEdit(product: ProductRow) {
    setEditingId(product.id);
    setFormData({
      name: product.name ?? '',
      merchant: product.merchant ?? '',
      price: Number(product.price) || 0,
      category: product.category ?? '',
      category_tint: (CATEGORY_TINTS as readonly string[]).includes(product.category_tint)
        ? (product.category_tint as CategoryTint)
        : 'default',
      image: product.image ?? '',
      min_vip: Number(product.min_vip) || 0,
      is_lucky: !!product.is_lucky,
      lucky_commission_percent: Number(product.lucky_commission_percent) || 0,
      sort_order: Number(product.sort_order) || 0,
    });
    setFormOpen(true);
  }

  async function handleSubmit() {
    if (!formData.name.trim() || !formData.merchant.trim()) {
      toast.error('Name and merchant are required');
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        await updateProduct(editingId, formData);
        await logActivity('admin', 'update_product', 'product', editingId, `Updated product "${formData.name}"`);
        toast.success('Product updated', { description: formData.name });
      } else {
        const created = await insertProduct(formData);
        const newId = created?.id ?? '';
        await logActivity('admin', 'create_product', 'product', newId, `Created product "${formData.name}"`);
        toast.success('Product created', { description: formData.name });
      }
      setFormOpen(false);
      await loadProducts();
    } catch (err) {
      toast.error(editingId ? 'Failed to update product' : 'Failed to create product', {
        description: err instanceof Error ? err.message : 'Please try again.',
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteProduct(deleteTarget.id);
      await logActivity('admin', 'delete_product', 'product', deleteTarget.id, `Deleted product "${deleteTarget.name}"`);
      toast.success('Product deleted', { description: deleteTarget.name });
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
        title="Product Management"
        subtitle="Create, edit, and manage the product catalog available to users."
        action={
          <div className="flex items-center gap-2">
            <NexBadge variant="success" dot>Realtime</NexBadge>
            <NexButton leftIcon={<Plus className="size-4" />} onClick={openAdd}>
              Add Product
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
          <div className="flex flex-wrap gap-2">
            {(['all', 'lucky', 'non-lucky'] as Filter[]).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent'
                )}
              >
                {f === 'all' ? 'All' : f === 'lucky' ? 'Lucky' : 'Non-Lucky'}
              </button>
            ))}
          </div>
        </div>
      </NexCard>

      {/* Grid */}
      {loading ? (
        <div className="flex h-48 items-center justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title={search.trim() ? 'No matching products' : 'No products yet'}
          description={
            search.trim()
              ? 'Try a different search term or filter.'
              : 'Add your first product to start building the catalog.'
          }
          action={
            !search.trim() ? (
              <NexButton leftIcon={<Plus className="size-4" />} onClick={openAdd}>
                Add Product
              </NexButton>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {filtered.map((product, i) => (
              <motion.div
                key={product.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.04, 0.2) }}
              >
                <ProductCard
                  product={product}
                  onEdit={() => openEdit(product)}
                  onDelete={() => setDeleteTarget(product)}
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
            <NexModalTitle>{editingId ? 'Edit Product' : 'Add Product'}</NexModalTitle>
            <NexModalDescription>
              {editingId
                ? 'Update the details of this product.'
                : 'Fill in the details to create a new product.'}
            </NexModalDescription>
          </NexModalHeader>

          <div className="space-y-5">
            {/* Section: Basic info */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Basic Information
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Name" required>
                  <NexInput
                    value={formData.name}
                    onChange={(e) => setFormData((d) => ({ ...d, name: e.target.value }))}
                    placeholder="e.g. iPhone 15 Pro"
                    className="h-10"
                  />
                </Field>
                <Field label="Merchant" required>
                  <NexInput
                    value={formData.merchant}
                    onChange={(e) => setFormData((d) => ({ ...d, merchant: e.target.value }))}
                    placeholder="e.g. Apple Store"
                    className="h-10"
                  />
                </Field>
                <Field label="Category">
                  <NexInput
                    value={formData.category}
                    onChange={(e) => setFormData((d) => ({ ...d, category: e.target.value }))}
                    placeholder="e.g. Electronics"
                    className="h-10"
                  />
                </Field>
                <Field label="Price ($)">
                  <NexInput
                    type="number"
                    min={0}
                    step="0.01"
                    value={formData.price}
                    onChange={(e) => setFormData((d) => ({ ...d, price: Number(e.target.value) || 0 }))}
                    className="h-10"
                  />
                </Field>
              </div>
              <Field label="Image URL">
                <NexInput
                  value={formData.image}
                  onChange={(e) => setFormData((d) => ({ ...d, image: e.target.value }))}
                  placeholder="https://..."
                  className="h-10"
                />
              </Field>
            </div>

            {/* Section: Category tint */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Category Tint
              </p>
              <div className="flex flex-wrap gap-2">
                {CATEGORY_TINTS.map((tint) => (
                  <button
                    key={tint}
                    type="button"
                    onClick={() => setFormData((d) => ({ ...d, category_tint: tint }))}
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-semibold capitalize transition-all',
                      formData.category_tint === tint
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-card text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {tint}
                  </button>
                ))}
              </div>
            </div>

            {/* Section: Access & ordering */}
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Access & Ordering
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Min VIP Level">
                  <NexInput
                    type="number"
                    min={0}
                    value={formData.min_vip}
                    onChange={(e) => setFormData((d) => ({ ...d, min_vip: Number(e.target.value) || 0 }))}
                    className="h-10"
                  />
                </Field>
                <Field label="Sort Order">
                  <NexInput
                    type="number"
                    min={0}
                    value={formData.sort_order}
                    onChange={(e) => setFormData((d) => ({ ...d, sort_order: Number(e.target.value) || 0 }))}
                    className="h-10"
                  />
                </Field>
              </div>
            </div>

            {/* Section: Lucky product */}
            <div className="space-y-3 rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Star className="size-4 text-warning" />
                  <span className="text-sm font-semibold text-foreground">Lucky Product</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={formData.is_lucky}
                  onClick={() => setFormData((d) => ({ ...d, is_lucky: !d.is_lucky }))}
                  className={cn(
                    'relative h-6 w-11 rounded-full transition-colors',
                    formData.is_lucky ? 'bg-primary' : 'bg-muted-foreground/30'
                  )}
                >
                  <motion.span
                    layout
                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    className={cn(
                      'absolute top-0.5 size-5 rounded-full bg-white shadow-sm',
                      formData.is_lucky ? 'left-[1.375rem]' : 'left-0.5'
                    )}
                  />
                </button>
              </div>
              <AnimatePresence>
                {formData.is_lucky && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <Field label="Lucky Commission (%)">
                      <NexInput
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={formData.lucky_commission_percent}
                        onChange={(e) =>
                          setFormData((d) => ({ ...d, lucky_commission_percent: Number(e.target.value) || 0 }))
                        }
                        className="h-10"
                      />
                    </Field>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <NexModalFooter>
            <NexButton variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>
              Cancel
            </NexButton>
            <NexButton onClick={handleSubmit} isLoading={saving}>
              {editingId ? 'Save Changes' : 'Create Product'}
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
                <NexModalTitle>Delete product?</NexModalTitle>
                <NexModalDescription>
                  This action cannot be undone. The product will be permanently removed from the catalog.
                </NexModalDescription>
              </div>
            </div>
          </NexModalHeader>

          {deleteTarget && (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-3">
                <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {deleteTarget.image ? (
                    <img src={deleteTarget.image} alt="" className="size-full object-cover" />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted-foreground">
                      <Package className="size-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate font-semibold text-foreground">{deleteTarget.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {deleteTarget.merchant} · ${fmt(deleteTarget.price)}
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
              Delete Product
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

function ProductCard({
  product,
  onEdit,
  onDelete,
}: {
  product: ProductRow;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <NexCard className="group flex h-full flex-col overflow-hidden" interactive>
      {/* Image */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
        {product.image ? (
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <Package className="size-8" />
          </div>
        )}
        {/* Badges overlay */}
        <div className="absolute left-2 top-2 flex flex-wrap gap-1.5">
          {product.is_lucky && (
            <span className="flex items-center gap-0.5 rounded-full bg-gradient-to-r from-warning to-danger px-2 py-0.5 text-[10px] font-bold text-white shadow-sm">
              <Star className="size-2.5 fill-white" />
              Lucky
            </span>
          )}
          {product.category && (
            <NexBadge variant={tintBadgeVariant[product.category_tint as CategoryTint] ?? 'default'} size="sm">
              {product.category}
            </NexBadge>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 text-sm font-semibold text-foreground">{product.name}</h3>
          <span className="shrink-0 text-sm font-bold text-foreground">${fmt(product.price)}</span>
        </div>
        <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{product.merchant}</p>

        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <NexBadge variant="muted" size="sm">
            VIP {product.min_vip}+
          </NexBadge>
          {product.is_lucky && (
            <NexBadge variant="warning" size="sm">
              {Number(product.lucky_commission_percent)}% comm
            </NexBadge>
          )}
          <NexBadge variant="outline" size="sm">
            #{product.sort_order}
          </NexBadge>
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
          <NexButton variant="outline" size="sm" className="flex-1" leftIcon={<Pencil className="size-3.5" />} onClick={onEdit}>
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
