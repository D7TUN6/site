import { type Accessor, type Setter } from 'solid-js'
import type { Lang } from '@/types/content'
import type { AdminShopProduct } from '@/types/admin'
import type { ShopProductStatus } from '@/types/shop'
import { UiSelect, type UiSelectOption } from '@/components/ui-select'
import type { ShopEditState } from '../admin-panel'

const SHOP_STATUS_OPTIONS: UiSelectOption[] = [
  { value: 'available', label: 'available' },
  { value: 'sold_out', label: 'sold_out' },
  { value: 'coming_soon', label: 'coming_soon' },
]

export function AdminShopEditorFields(props: { shopEdit: Accessor<ShopEditState>; setShopEdit: Setter<ShopEditState>; product?: AdminShopProduct; lang: Lang; categories: UiSelectOption[] }) {
  const setField = <K extends keyof ShopEditState>(key: K, value: ShopEditState[K]) => props.setShopEdit({ ...props.shopEdit(), [key]: value })
  return (<>
    <label class="form-field"><span class="form-label">title</span><input class="form-input" value={props.shopEdit().title} onInput={(e) => setField('title', e.currentTarget.value)} /></label>
    <label class="form-field"><span class="form-label">category</span><UiSelect modelValue={props.shopEdit().category} options={props.categories} onChange={(v) => setField('category', v)} ariaLabel="Category" /></label>
    <label class="form-field"><span class="form-label">price</span><input class="form-input" inputMode="numeric" value={props.shopEdit().price} onInput={(e) => setField('price', Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)))} /></label>
    <label class="form-field"><span class="form-label">status</span><UiSelect modelValue={props.shopEdit().status} options={SHOP_STATUS_OPTIONS} onChange={(v) => setField('status', v as ShopProductStatus)} ariaLabel="Status" /></label>
    <label class="form-field"><span class="form-label">quantity</span><input class="form-input" inputMode="numeric" value={props.shopEdit().quantity} onInput={(e) => setField('quantity', Math.max(0, Math.floor(Number(e.currentTarget.value) || 0)))} /></label>
    <label class="form-field form-field-full"><span class="form-label">description en</span><textarea class="form-textarea" rows="4" value={props.shopEdit().descriptionEn} onInput={(e) => setField('descriptionEn', e.currentTarget.value)} /></label>
    <label class="form-field form-field-full"><span class="form-label">description ru</span><textarea class="form-textarea" rows="4" value={props.shopEdit().descriptionRu} onInput={(e) => setField('descriptionRu', e.currentTarget.value)} /></label>
  </>)
}
