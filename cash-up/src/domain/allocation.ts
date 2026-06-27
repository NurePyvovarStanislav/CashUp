export type AllocationId = string | number

export interface AllocationItem {
  id: AllocationId
  allocatedMinor: number
}

export type MinimumAllocationMap = ReadonlyMap<AllocationId, number>
export type LockedAllocationSet = ReadonlySet<AllocationId>

export interface AllocationResult<T> {
  items: T[]
  error?: string
}

function cloneItems<T extends AllocationItem>(items: readonly T[]): T[] {
  return items.map((item) => ({ ...item }))
}

function increaseEvenly<T extends AllocationItem>(
  items: readonly T[],
  amountMinor: number,
  lockedIds: LockedAllocationSet = new Set(),
): T[] | null {
  const next = cloneItems(items)

  if (amountMinor <= 0) {
    return next
  }

  const eligibleIndexes = next.flatMap((item, index) =>
    lockedIds.has(item.id) ? [] : [index],
  )

  if (eligibleIndexes.length === 0) {
    return null
  }

  const base = Math.floor(amountMinor / eligibleIndexes.length)
  const remainder = amountMinor % eligibleIndexes.length

  eligibleIndexes.forEach((index, position) => {
    next[index] = {
      ...next[index],
      allocatedMinor:
        next[index].allocatedMinor +
        base +
        (position < remainder ? 1 : 0),
    }
  })

  return next
}

function decreaseEvenly<T extends AllocationItem>(
  items: readonly T[],
  amountMinor: number,
  minimums: MinimumAllocationMap = new Map(),
  lockedIds: LockedAllocationSet = new Set(),
): T[] | null {
  const next = cloneItems(items)
  let remaining = amountMinor

  while (remaining > 0) {
    const eligible = next
      .map((item, index) => ({
        index,
        id: item.id,
        capacity:
          item.allocatedMinor - (minimums.get(item.id) ?? 0),
      }))
      .filter(
        ({ id, capacity }) => !lockedIds.has(id) && capacity > 0,
      )

    if (eligible.length === 0) {
      return null
    }

    const base = Math.floor(remaining / eligible.length)
    const remainder = remaining % eligible.length
    let reducedThisRound = 0

    eligible.forEach(({ index, capacity }, position) => {
      const requested = base + (position < remainder ? 1 : 0)
      const reduction = Math.min(capacity, requested)

      if (reduction > 0) {
        next[index] = {
          ...next[index],
          allocatedMinor: next[index].allocatedMinor - reduction,
        }
        reducedThisRound += reduction
      }
    })

    if (reducedThisRound === 0) {
      return null
    }

    remaining -= reducedThisRound
  }

  return next
}

export function setTargetAllocation<T extends AllocationItem>(
  items: readonly T[],
  targetId: AllocationId,
  targetAmountMinor: number,
  minimums: MinimumAllocationMap = new Map(),
  lockedIds: LockedAllocationSet = new Set(),
): AllocationResult<T> {
  const target = items.find((item) => item.id === targetId)

  if (!target) {
    return { items: cloneItems(items), error: 'Категория не найдена' }
  }

  const minimum = minimums.get(targetId) ?? 0
  const safeTarget = Math.max(minimum, targetAmountMinor)
  const difference = safeTarget - target.allocatedMinor

  if (difference === 0) {
    return { items: cloneItems(items) }
  }

  const others = items.filter((item) => item.id !== targetId)

  if (difference > 0) {
    const reduced = decreaseEvenly(
      others,
      difference,
      minimums,
      lockedIds,
    )

    if (!reduced) {
      return {
        items: cloneItems(items),
        error:
          'У незакреплённых категорий недостаточно свободных денег',
      }
    }

    const byId = new Map(reduced.map((item) => [item.id, item]))

    return {
      items: items.map((item) =>
        item.id === targetId
          ? { ...item, allocatedMinor: safeTarget }
          : (byId.get(item.id) ?? item),
      ),
    }
  }

  const increased = increaseEvenly(
    others,
    Math.abs(difference),
    lockedIds,
  )

  if (!increased) {
    return {
      items: cloneItems(items),
      error: 'Нет незакреплённых категорий для перераспределения',
    }
  }

  const byId = new Map(increased.map((item) => [item.id, item]))

  return {
    items: items.map((item) =>
      item.id === targetId
        ? { ...item, allocatedMinor: safeTarget }
        : (byId.get(item.id) ?? item),
    ),
  }
}

export function addAllocationItem<T extends AllocationItem>(
  items: readonly T[],
  newItem: T,
  minimums: MinimumAllocationMap = new Map(),
  lockedIds: LockedAllocationSet = new Set(),
): AllocationResult<T> {
  const reduced = decreaseEvenly(
    items,
    newItem.allocatedMinor,
    minimums,
    lockedIds,
  )

  if (!reduced) {
    return {
      items: cloneItems(items),
      error:
        'У незакреплённых категорий недостаточно денег для новой категории',
    }
  }

  return { items: [...reduced, { ...newItem }] }
}

export function removeAllocationItem<T extends AllocationItem>(
  items: readonly T[],
  id: AllocationId,
  lockedIds: LockedAllocationSet = new Set(),
): AllocationResult<T> {
  const removed = items.find((item) => item.id === id)
  const remaining = items.filter((item) => item.id !== id)

  if (!removed) {
    return { items: cloneItems(items), error: 'Категория не найдена' }
  }

  if (remaining.length === 0) {
    return {
      items: cloneItems(items),
      error: 'Нельзя удалить последнюю категорию',
    }
  }

  const increased = increaseEvenly(
    remaining,
    removed.allocatedMinor,
    lockedIds,
  )

  if (!increased) {
    return {
      items: cloneItems(items),
      error: 'Нет незакреплённых категорий для перераспределения',
    }
  }

  return { items: increased }
}

export function subtractFromBudget<T extends AllocationItem>(
  items: readonly T[],
  amountMinor: number,
  minimums: MinimumAllocationMap = new Map(),
  lockedIds: LockedAllocationSet = new Set(),
): AllocationResult<T> {
  const reduced = decreaseEvenly(
    items,
    amountMinor,
    minimums,
    lockedIds,
  )

  if (!reduced) {
    return {
      items: cloneItems(items),
      error: 'В незакреплённых категориях недостаточно свободных денег',
    }
  }

  return { items: reduced }
}

export function addToBudgetProportionally<T extends AllocationItem>(
  items: readonly T[],
  amountMinor: number,
  lockedIds: LockedAllocationSet = new Set(),
): AllocationResult<T> {
  const next = cloneItems(items)

  if (amountMinor <= 0) {
    return { items: next }
  }

  const eligible = next.filter((item) => !lockedIds.has(item.id))

  if (eligible.length === 0) {
    return {
      items: next,
      error: 'Нет незакреплённых категорий для пополнения',
    }
  }

  const totalWeight = eligible.reduce(
    (sum, item) => sum + item.allocatedMinor,
    0,
  )

  if (totalWeight <= 0) {
    const increased = increaseEvenly(next, amountMinor, lockedIds)

    return increased
      ? { items: increased }
      : {
          items: next,
          error: 'Нет незакреплённых категорий для пополнения',
        }
  }

  const shares = eligible.map((item) => {
    const raw = (amountMinor * item.allocatedMinor) / totalWeight
    const base = Math.floor(raw)

    return {
      id: item.id,
      base,
      fraction: raw - base,
    }
  })

  let remaining =
    amountMinor - shares.reduce((sum, share) => sum + share.base, 0)

  shares
    .slice()
    .sort((left, right) => right.fraction - left.fraction)
    .forEach((share) => {
      if (remaining > 0) {
        share.base += 1
        remaining -= 1
      }
    })

  const additions = new Map(
    shares.map((share) => [share.id, share.base]),
  )

  return {
    items: next.map((item) => ({
      ...item,
      allocatedMinor:
        item.allocatedMinor + (additions.get(item.id) ?? 0),
    })),
  }
}
