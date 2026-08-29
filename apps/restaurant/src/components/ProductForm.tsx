import { useState } from "react";
import { api } from "../lib/api";
import type { Category, ModifierGroup, Product } from "../pages/Menu";

export interface ProductFormValues {
  categoryId: string;
  name: string;
  description?: string;
  basePrice: number;
  isAvailable: boolean;
  allowsSplit: boolean;
  splitPricingRule: "MOST_EXPENSIVE" | "AVERAGE";
  defaultPrepTimeMinutes?: number | null;
  imageUrl?: string;
  imagePublicId?: string;
  modifierGroups: ModifierGroup[];
}

interface Props {
  categories: Category[];
  defaultCategoryId: string | null;
  product: Product | null;
  onClose: () => void;
  onSave: (values: ProductFormValues, productId?: string) => Promise<void>;
}

function emptyGroup(): ModifierGroup {
  return { name: "", required: false, minSelect: 0, maxSelect: 1, options: [{ name: "", priceDelta: 0, isDefault: false }] };
}

export default function ProductForm({ categories, defaultCategoryId, product, onClose, onSave }: Props) {
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? defaultCategoryId ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [basePrice, setBasePrice] = useState(product?.basePrice ?? 0);
  const [isAvailable, setIsAvailable] = useState(product?.isAvailable ?? true);
  const [allowsSplit, setAllowsSplit] = useState(product?.allowsSplit ?? false);
  const [splitPricingRule, setSplitPricingRule] = useState<"MOST_EXPENSIVE" | "AVERAGE">(
    product?.splitPricingRule ?? "MOST_EXPENSIVE",
  );
  const [prepTime, setPrepTime] = useState<string>(product?.defaultPrepTimeMinutes?.toString() ?? "");
  const [imageUrl, setImageUrl] = useState(product?.imageUrl ?? "");
  const [imagePublicId, setImagePublicId] = useState<string | undefined>();
  const [groups, setGroups] = useState<ModifierGroup[]>(product?.modifierGroups ?? []);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "products");
      const { data } = await api.post("/uploads", form);
      setImageUrl(data.url);
      setImagePublicId(data.publicId);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível enviar a imagem");
    } finally {
      setUploading(false);
    }
  }

  function updateGroup(index: number, patch: Partial<ModifierGroup>) {
    setGroups((gs) => gs.map((g, i) => (i === index ? { ...g, ...patch } : g)));
  }
  function updateOption(gIndex: number, oIndex: number, patch: Partial<ModifierGroup["options"][number]>) {
    setGroups((gs) =>
      gs.map((g, i) =>
        i === gIndex ? { ...g, options: g.options.map((o, j) => (j === oIndex ? { ...o, ...patch } : o)) } : g,
      ),
    );
  }
  function addOption(gIndex: number) {
    setGroups((gs) =>
      gs.map((g, i) => (i === gIndex ? { ...g, options: [...g.options, { name: "", priceDelta: 0, isDefault: false }] } : g)),
    );
  }
  function removeOption(gIndex: number, oIndex: number) {
    setGroups((gs) => gs.map((g, i) => (i === gIndex ? { ...g, options: g.options.filter((_, j) => j !== oIndex) } : g)));
  }
  function removeGroup(gIndex: number) {
    setGroups((gs) => gs.filter((_, i) => i !== gIndex));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!categoryId) {
      setError("Escolha uma categoria");
      return;
    }
    const cleanGroups = groups
      .filter((g) => g.name.trim() && g.options.some((o) => o.name.trim()))
      .map((g) => ({ ...g, options: g.options.filter((o) => o.name.trim()) }));

    setSaving(true);
    try {
      await onSave(
        {
          categoryId,
          name,
          description: description || undefined,
          basePrice,
          isAvailable,
          allowsSplit,
          splitPricingRule,
          defaultPrepTimeMinutes: prepTime ? Number(prepTime) : null,
          imageUrl: imageUrl || undefined,
          imagePublicId,
          modifierGroups: cleanGroups,
        },
        product?.id,
      );
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível guardar o produto");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
        <h2>{product ? "Editar produto" : "Novo produto"}</h2>
        <form onSubmit={handleSubmit} className="product-form">
          <label>
            Categoria
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              <option value="">Escolher...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Nome
            <input value={name} onChange={(e) => setName(e.target.value)} required minLength={1} />
          </label>
          <label>
            Descrição
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
          <label>
            Preço base (€)
            <input
              type="number"
              step="0.01"
              min={0}
              value={basePrice}
              onChange={(e) => setBasePrice(Number(e.target.value))}
              required
            />
          </label>
          <label>
            Tempo de preparação (min) — deixar vazio para usar o valor por defeito do restaurante
            <input type="number" min={1} value={prepTime} onChange={(e) => setPrepTime(e.target.value)} />
          </label>
          <label>
            Imagem
            <input type="file" accept="image/*" onChange={handleImageChange} disabled={uploading} />
          </label>
          {imageUrl && <img src={imageUrl} alt="" style={{ width: 96, height: 96, objectFit: "cover", borderRadius: 8 }} />}
          {uploading && <p className="hint">A enviar imagem...</p>}

          <label className="checkbox">
            <input type="checkbox" checked={isAvailable} onChange={(e) => setIsAvailable(e.target.checked)} />
            Disponível
          </label>
          <label className="checkbox">
            <input type="checkbox" checked={allowsSplit} onChange={(e) => setAllowsSplit(e.target.checked)} />
            Permitir "meio a meio" com outro produto da mesma categoria
          </label>
          {allowsSplit && (
            <label>
              Regra de preço do meio a meio
              <select value={splitPricingRule} onChange={(e) => setSplitPricingRule(e.target.value as any)}>
                <option value="MOST_EXPENSIVE">Sabor mais caro</option>
                <option value="AVERAGE">Média dos dois sabores</option>
              </select>
            </label>
          )}

          <h3>Grupos de modificadores</h3>
          {groups.map((g, gi) => (
            <div className="modifier-group-editor" key={gi}>
              <div className="modifier-option-row">
                <input
                  type="text"
                  placeholder="Nome do grupo (ex.: Tamanho)"
                  value={g.name}
                  onChange={(e) => updateGroup(gi, { name: e.target.value })}
                />
                <button type="button" className="danger" onClick={() => removeGroup(gi)}>
                  Remover grupo
                </button>
              </div>
              <div className="modifier-option-row">
                <label className="checkbox">
                  <input type="checkbox" checked={g.required} onChange={(e) => updateGroup(gi, { required: e.target.checked })} />
                  Obrigatório
                </label>
                <label>
                  Mín.
                  <input type="number" min={0} value={g.minSelect} onChange={(e) => updateGroup(gi, { minSelect: Number(e.target.value) })} />
                </label>
                <label>
                  Máx.
                  <input type="number" min={1} value={g.maxSelect} onChange={(e) => updateGroup(gi, { maxSelect: Number(e.target.value) })} />
                </label>
              </div>
              {g.options.map((o, oi) => (
                <div className="modifier-option-row" key={oi}>
                  <input
                    type="text"
                    placeholder="Opção (ex.: Grande)"
                    value={o.name}
                    onChange={(e) => updateOption(gi, oi, { name: e.target.value })}
                  />
                  <input
                    type="number"
                    step="0.01"
                    placeholder="+€"
                    value={o.priceDelta}
                    onChange={(e) => updateOption(gi, oi, { priceDelta: Number(e.target.value) })}
                  />
                  <button type="button" className="link-danger" onClick={() => removeOption(gi, oi)}>
                    ×
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => addOption(gi)}>
                + Opção
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setGroups((gs) => [...gs, emptyGroup()])}>
            + Novo grupo de modificadores
          </button>

          {error && <p className="form-error">{error}</p>}
          <div className="card-actions">
            <button type="submit" disabled={saving || uploading}>
              {saving ? "A guardar..." : "Guardar"}
            </button>
            <button type="button" className="link-btn" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
