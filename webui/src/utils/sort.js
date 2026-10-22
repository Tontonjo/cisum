// Cisum web player v0.6.0 - Client-side sorting for lists loaded in one request.
import { useMemo, useState } from 'react'
import { useSort } from '../store/preferences'

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/**
 * Returns a sorted copy of items. option.value(item) gives the value to compare
 * (string, number or date string); empty values always go last, whatever the direction.
 * option.random shuffles instead.
 */
export function sortItems(items, option, dir) {
  if (!option) return items
  if (option.random) return [...items].sort(() => Math.random() - 0.5)
  const sign = dir === 'DESC' ? -1 : 1
  const empty = (v) => v === undefined || v === null || v === ''
  return [...items].sort((a, b) => {
    const va = option.value(a)
    const vb = option.value(b)
    if (empty(va) || empty(vb)) return empty(va) - empty(vb)
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : collator.compare(String(va), String(vb))
    return sign * c
  })
}

/**
 * Sort of a list loaded in one request, remembered per user (see useSort).
 * Returns { sort, onSort, sorted } ready for SortChips; selecting "Random" again reshuffles.
 */
export function useClientSort(listKey, options, defaultKey, items) {
  const [sort, setSort] = useSort(listKey, options, defaultKey)
  const [seed, setSeed] = useState(0)
  const sorted = useMemo(
    () => sortItems(items || [], options[sort.key], sort.dir),
    // seed only forces a new random order
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, options, sort.key, sort.dir, seed],
  )
  const onSort = (v) => (v.key === sort.key && options[v.key].random ? setSeed((s) => s + 1) : setSort(v))
  return { sort, onSort, sorted }
}
