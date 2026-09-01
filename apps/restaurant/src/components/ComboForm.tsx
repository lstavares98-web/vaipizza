import { useMemo, useState } from "react";
import { api } from "../lib/api";
import type { Product } from "../pages/Menu";
import type { Combo, ComboFormValues, ComboGroupDraft, ComboFixedDraft } from "../pages/Combos";

interface Props {
  combo: Combo | null;
  products: Product[];
  onClose: () => void;
  onSave: (values: ComboFormValues, id?: string) => Promise<void>;
}

const DAYS = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

function dateTimeLocal(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function emptyFixed(): ComboFixedDraft {
  return { productId: "", quantity: 1 };
}

function emptyGroup(): ComboGroupDraft {
  return { name: "", minSelect: 1, maxSelect: 1, options: [{ productId: "", priceDelta: 0 }] };
}

export default function ComboForm({ combo, products, onClose, onSave }: Props) {
  const [name, setName] = useState(combo?.name ?? "");
  const [description, setDescription] = useState(combo?.description ?? "");
  const [basePrice, setBasePrice] = useState(combo?.basePrice?.toString() ?? "");
  const [compareAtPrice, setCompareAtPrice] = useState(combo?.compareAtPrice?.toString() ?? "");
  const [imageUrl, setImageUrl] = useState(combo?.imageUrl ?? "");
  const [imagePublicId, setImagePublicId] = useState<string | null>(combo?.imagePublicId ?? null);
  const [isActive, setIsActive] = useState(combo?.isActive ?? true);
  const [isFeatured, setIsFeatured] = useState(combo?.isFeatured ?? false);
  const [startsAt, setStartsAt] = useState(dateTimeLocal(combo?.startsAt));
  const [endsAt, setEndsAt] = useState(dateTimeLocal(combo?.endsAt));
  const [availableDays, setAvailableDays] = useState<number[]>(combo?.availableDays ?? []);
  const [availableFrom, setAvailableFrom] = useState(combo?.availableFrom ?? "");
  const [availableTo, setAvailableTo] = useState(combo?.availableTo ?? "");
  const [fixedItems, setFixedItems] = useState<ComboFixedDraft[]>(
    combo?.fixedItems.map((item) => ({ productId: item.productId, quantity: item.quantity })) ?? [],
  );
  const [groups, setGroups] = useState<ComboGroupDraft[]>(
    combo?.groups.map((group) => ({
      name: group.name,
      minSelect: group.minSelect,
      maxSelect: group.maxSelect,
      options: group.options.map((option) => ({ productId: option.productId, priceDelta: option.priceDelta })),
    })) ?? [],
  );
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const usableProducts = useMemo(() => [...products].sort((a, b) => a.name.localeCompare(b.name)), [products]);

  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("folder", "combos");
      const { data } = await api.post("/uploads", form);
      setImageUrl(data.url);
      setImagePublicId(data.publicId);
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível enviar a imagem");
    } finally {
      setUploading(false);
    }
  }

  function toggleDay(day: number) {
    setAvailableDays((days) => (days.includes(day) ? days.filter((item) => item !== day) : [...days, day]));
  }

  function updateFixed(index: number, patch: Partial<ComboFixedDraft>) {
    setFixedItems((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function updateGroup(index: number, patch: Partial<ComboGroupDraft>) {
    setGroups((items) => items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function updateGroupOption(groupIndex: number, optionIndex: number, patch: Partial<ComboGroupDraft["options"][number]>) {
    setGroups((items) =>
      items.map((group, i) =>
        i === groupIndex
          ? { ...group, options: group.options.map((option, j) => (j === optionIndex ? { ...option, ...patch } : option)) }
          : group,
      ),
    );
  }

  function validate() {
    if (!name.trim()) return "Dê um nome ao combo";
    if (basePrice === "" || Number(basePrice) < 0) return "Indique um preço válido";
    if (compareAtPrice && Number(compareAtPrice) < Number(basePrice)) return "O preço anterior não pode ser inferior ao preço atual";
    if (fixedItems.length === 0 && groups.length === 0) return "Adicione pelo menos um item fixo ou grupo de escolha";
    if (fixedItems.some((item) => !item.productId || item.quantity < 1)) return "Revise os itens fixos";
    for (const group of groups) {
      if (!group.name.trim()) return "Todos os grupos precisam de um nome";
      if (group.minSelect < 0 || group.maxSelect < 1 || group.minSelect > group.maxSelect) return `Revise os limites do grupo “${group.name}”`;
      if (group.options.length === 0 || group.options.some((option) => !option.productId)) return `Adicione opções válidas ao grupo “${group.name}”`;
      if (group.minSelect > new Set(group.options.map((option) => option.productId)).size) return `O grupo “${group.name}” não tem opções suficientes para o mínimo definido`;
    }
    if (startsAt && endsAt && new Date(startsAt) > new Date(endsAt)) return "A data de início não pode ser posterior ao fim";
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    if (uploading) {
      setError("Aguarde o envio da imagem terminar");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave(
        {
          name: name.trim(),
          description: description.trim() || undefined,
          basePrice: Number(basePrice),
          compareAtPrice: compareAtPrice ? Number(compareAtPrice) : null,
          imageUrl: imageUrl || null,
          imagePublicId: imagePublicId || null,
          isActive,
          isFeatured,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          endsAt: endsAt ? new Date(endsAt).toISOString() : null,
          availableDays,
          availableFrom: availableFrom || null,
          availableTo: availableTo || null,
          fixedItems: fixedItems.map((item, sortOrder) => ({ ...item, quantity: Number(item.quantity), sortOrder })),
          groups: groups.map((group, sortOrder) => ({
            name: group.name.trim(),
            minSelect: Number(group.minSelect),
            maxSelect: Number(group.maxSelect),
            sortOrder,
            options: group.options.map((option, optionSortOrder) => ({
              productId: option.productId,
              priceDelta: Number(option.priceDelta) || 0,
              sortOrder: optionSortOrder,
            })),
          })),
        },
        combo?.id,
      );
    } catch (err: any) {
      setError(err.response?.data?.message ?? "Não foi possível guardar o combo");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal combo-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="combo-editor-head">
          <div>
            <span className="page-eyebrow">Configuração do menu</span>
            <h2>{combo ? "Editar combo" : "Novo combo"}</h2>
          </div>
          <button type="button" className="icon-close" onClick={onClose} aria-label="Fechar">×</button>
        </div>
        <form className="product-form combo-form" onSubmit={handleSubmit}>
          <section className="combo-form-section">
            <h3>Apresentação</h3>
            <div className="combo-form-grid two">
              <label>Nome<input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} /></label>
              <label>Preço (€)<input type="number" min={0} step="0.01" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} /></label>
              <label className="span-2">Descrição<textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} /></label>
              <label>Preço anterior (€)<input type="number" min={0} step="0.01" value={compareAtPrice} onChange={(e) => setCompareAtPrice(e.target.value)} placeholder="Opcional" /></label>
              <div className="combo-image-field">
                <label>Foto<input type="file" accept="image/*" onChange={handleImageChange} disabled={uploading} /></label>
                {imageUrl && (
                  <div className="combo-image-preview">
                    <img src={imageUrl} alt="Pré-visualização do combo" />
                    <button type="button" className="link-danger" onClick={() => { setImageUrl(""); setImagePublicId(null); }}>Remover foto</button>
                  </div>
                )}
                {uploading && <span className="hint">A enviar imagem...</span>}
              </div>
            </div>
            <div className="combo-toggle-row">
              <label className="checkbox"><input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} /> Ativo</label>
              <label className="checkbox"><input type="checkbox" checked={isFeatured} onChange={(e) => setIsFeatured(e.target.checked)} /> Destacar no menu</label>
            </div>
          </section>

          <section className="combo-form-section">
            <div className="combo-section-title"><div><h3>Itens incluídos</h3><p>Produtos que entram sempre no combo.</p></div><button type="button" className="secondary compact" onClick={() => setFixedItems((items) => [...items, emptyFixed()])}>+ Item fixo</button></div>
            {fixedItems.length === 0 && <p className="hint">Nenhum item fixo. Pode usar apenas grupos de escolha.</p>}
            <div className="combo-editor-list">
              {fixedItems.map((item, index) => (
                <div className="combo-line-editor" key={index}>
                  <select value={item.productId} onChange={(e) => updateFixed(index, { productId: e.target.value })}>
                    <option value="">Escolher produto...</option>
                    {usableProducts.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}
                  </select>
                  <input aria-label="Quantidade" type="number" min={1} max={50} value={item.quantity} onChange={(e) => updateFixed(index, { quantity: Number(e.target.value) })} />
                  <button type="button" className="link-danger" onClick={() => setFixedItems((items) => items.filter((_, i) => i !== index))}>×</button>
                </div>
              ))}
            </div>
          </section>

          <section className="combo-form-section">
            <div className="combo-section-title"><div><h3>Grupos de escolha</h3><p>Ex.: “Escolha 2 pizzas” ou “Escolha 1 bebida”.</p></div><button type="button" className="secondary compact" onClick={() => setGroups((items) => [...items, emptyGroup()])}>+ Grupo</button></div>
            {groups.length === 0 && <p className="hint">Nenhum grupo de escolha.</p>}
            {groups.map((group, groupIndex) => (
              <div className="combo-group-editor" key={groupIndex}>
                <div className="combo-group-head">
                  <input className="combo-group-name" placeholder="Nome do grupo" value={group.name} onChange={(e) => updateGroup(groupIndex, { name: e.target.value })} />
                  <div className="combo-limits"><label>Mín.<input type="number" min={0} max={20} value={group.minSelect} onChange={(e) => updateGroup(groupIndex, { minSelect: Number(e.target.value) })} /></label><label>Máx.<input type="number" min={1} max={20} value={group.maxSelect} onChange={(e) => updateGroup(groupIndex, { maxSelect: Number(e.target.value) })} /></label></div>
                  <button type="button" className="link-danger" onClick={() => setGroups((items) => items.filter((_, i) => i !== groupIndex))}>Remover</button>
                </div>
                <div className="combo-options-editor">
                  {group.options.map((option, optionIndex) => (
                    <div className="combo-line-editor combo-option-line" key={optionIndex}>
                      <select value={option.productId} onChange={(e) => updateGroupOption(groupIndex, optionIndex, { productId: e.target.value })}>
                        <option value="">Produto...</option>
                        {usableProducts.map((product) => <option value={product.id} key={product.id}>{product.name}</option>)}
                      </select>
                      <label className="delta-field"><span>Acréscimo</span><input type="number" step="0.01" value={option.priceDelta} onChange={(e) => updateGroupOption(groupIndex, optionIndex, { priceDelta: Number(e.target.value) })} /></label>
                      <button type="button" className="link-danger" onClick={() => updateGroup(groupIndex, { options: group.options.filter((_, i) => i !== optionIndex) })}>×</button>
                    </div>
                  ))}
                  <button type="button" className="mini-add" onClick={() => updateGroup(groupIndex, { options: [...group.options, { productId: "", priceDelta: 0 }] })}>+ Adicionar opção</button>
                </div>
              </div>
            ))}
          </section>

          <section className="combo-form-section">
            <h3>Disponibilidade</h3>
            <div className="day-chips" aria-label="Dias disponíveis">
              {DAYS.map((day) => <button type="button" key={day.value} className={availableDays.includes(day.value) ? "active" : ""} onClick={() => toggleDay(day.value)}>{day.label}</button>)}
              <span className="hint">Sem dias selecionados = todos os dias</span>
            </div>
            <div className="combo-form-grid two">
              <label>Início da campanha<input type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></label>
              <label>Fim da campanha<input type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></label>
              <label>Horário inicial<input type="time" value={availableFrom} onChange={(e) => setAvailableFrom(e.target.value)} /></label>
              <label>Horário final<input type="time" value={availableTo} onChange={(e) => setAvailableTo(e.target.value)} /></label>
            </div>
          </section>

          {error && <p className="form-error">{error}</p>}
          <div className="combo-form-actions">
            <button type="button" className="secondary" onClick={onClose}>Cancelar</button>
            <button type="submit" disabled={saving || uploading}>{saving ? "A guardar..." : "Guardar combo"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
