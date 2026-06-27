import { useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { db } from '../../db/database'
import {
  addToBudgetProportionally,
  subtractFromBudget,
} from '../../domain/allocation'
import {
  formatCHF,
  parseMoneyInput,
} from '../../domain/money'
import type {
  BudgetCategory,
  BudgetPeriod,
} from '../../domain/models'

type StoredPeriod = Omit<BudgetPeriod, 'id'> & { id: number }
type StoredCategory = Omit<BudgetCategory, 'id'> & { id: number }
type SheetKind = 'expense' | 'budget' | 'category' | null

function toStoredCategories(
  categories: readonly BudgetCategory[],
): StoredCategory[] {
  return categories.flatMap((category) =>
    typeof category.id === 'number'
      ? [{ ...category, id: category.id, isPinned: category.isPinned ?? false }]
      : [],
  )
}

function todayISO(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
  }).format(new Date(`${value}T12:00:00`))
}

function daysUntil(value: string): number {
  const end = new Date(`${value}T23:59:59`)
  const difference = end.getTime() - Date.now()
  return Math.max(0, Math.ceil(difference / 86_400_000))
}

interface DashboardScreenProps {
  period: StoredPeriod
}

export function DashboardScreen({ period }: DashboardScreenProps) {
  const categories = useLiveQuery(
    () =>
      db.categories
        .where('periodId')
        .equals(period.id)
        .filter((category) => !category.isArchived)
        .sortBy('sortOrder'),
    [period.id],
    [],
  )

  const transactions = useLiveQuery(
    async () => {
      const items = await db.transactions
        .where('periodId')
        .equals(period.id)
        .toArray()

      return items.sort((left, right) =>
        right.occurredAt.localeCompare(left.occurredAt),
      )
    },
    [period.id],
    [],
  )

  const [sheet, setSheet] = useState<SheetKind>(null)
  const [error, setError] = useState('')

  const storedCategories = useMemo(
    () => toStoredCategories(categories),
    [categories],
  )

  const spentByCategory = useMemo(() => {
    const result = new Map<number, number>()

    transactions.forEach((transaction) => {
      if (
        transaction.scope === 'category' &&
        transaction.direction === 'expense' &&
        typeof transaction.categoryId === 'number'
      ) {
        result.set(
          transaction.categoryId,
          (result.get(transaction.categoryId) ?? 0) +
            transaction.amountMinor,
        )
      }
    })

    return result
  }, [transactions])

  const pinnedIds = useMemo(
    () =>
      new Set(
        storedCategories
          .filter((category) => category.isPinned)
          .map((category) => category.id),
      ),
    [storedCategories],
  )

  const categoryNames = useMemo(
    () =>
      new Map(
        storedCategories.map((category) => [category.id, category.name]),
      ),
    [storedCategories],
  )

  const currentBudget = storedCategories.reduce(
    (sum, category) => sum + category.allocatedMinor,
    0,
  )

  const totalSpent = Array.from(spentByCategory.values()).reduce(
    (sum, value) => sum + value,
    0,
  )

  const available = currentBudget - totalSpent
  const daysLeft = daysUntil(period.endDate)
  const dailySafe = daysLeft > 0 ? Math.floor(available / daysLeft) : available

  async function addExpense(data: {
    categoryId: number
    amountMinor: number
    occurredAt: string
    description: string
  }) {
    const category = storedCategories.find(
      (item) => item.id === data.categoryId,
    )
    const remaining = category
      ? category.allocatedMinor - (spentByCategory.get(category.id) ?? 0)
      : 0

    if (!category || data.amountMinor > remaining) {
      throw new Error('В этой категории недостаточно денег')
    }

    await db.transactions.add({
      periodId: period.id,
      categoryId: data.categoryId,
      direction: 'expense',
      scope: 'category',
      amountMinor: data.amountMinor,
      occurredAt: data.occurredAt,
      description: data.description || category.name,
    })
  }

  async function changeBudget(data: {
    direction: 'expense' | 'income'
    amountMinor: number
    occurredAt: string
    description: string
  }) {
    const minimums = new Map<number, number>(spentByCategory)

    let updatedItems: StoredCategory[]

    if (data.direction === 'expense') {
      const result = subtractFromBudget<StoredCategory>(
        storedCategories,
        data.amountMinor,
        minimums,
        pinnedIds,
      )

      if (result.error) {
        throw new Error(result.error)
      }

      updatedItems = result.items
    } else {
      const result = addToBudgetProportionally<StoredCategory>(
        storedCategories,
        data.amountMinor,
        pinnedIds,
      )

      if (result.error) {
        throw new Error(result.error)
      }

      updatedItems = result.items
    }

    await db.transaction(
      'rw',
      db.categories,
      db.transactions,
      async () => {
        await db.categories.bulkPut(updatedItems)
        await db.transactions.add({
          periodId: period.id,
          direction: data.direction,
          scope: 'budget',
          amountMinor: data.amountMinor,
          occurredAt: data.occurredAt,
          description:
            data.description ||
            (data.direction === 'income'
              ? 'Добавление в бюджет'
              : 'Списание из бюджета'),
        })
      },
    )
  }

  async function addCategory(data: {
    name: string
    amountMinor: number
  }) {
    const minimums = new Map<number, number>(spentByCategory)
    const result = subtractFromBudget<StoredCategory>(
      storedCategories,
      data.amountMinor,
      minimums,
      pinnedIds,
    )

    if (result.error) {
      throw new Error(result.error)
    }

    await db.transaction('rw', db.categories, async () => {
      await db.categories.bulkPut(result.items)
      await db.categories.add({
        periodId: period.id,
        name: data.name,
        allocatedMinor: data.amountMinor,
        sortOrder: storedCategories.length,
        isArchived: false,
        isPinned: false,
      })
    })
  }

  async function toggleCategoryPin(category: StoredCategory) {
    await db.categories.update(category.id, {
      isPinned: !category.isPinned,
    })
  }

  function closeSheet() {
    setSheet(null)
    setError('')
  }

  return (
    <main className="app-shell dashboard">
      <header className="dashboard-header">
        <div>
          <span className="overline">{formatDate(period.startDate)} — {formatDate(period.endDate)}</span>
          <h1>Обзор</h1>
        </div>
        <button
          className="round-add-button"
          onClick={() => setSheet('expense')}
          aria-label="Добавить расход"
        >
          +
        </button>
      </header>

      <section className="balance-card">
        <span>Доступно</span>
        <strong>{formatCHF(available)}</strong>
        <div className="balance-card__meta">
          <span>{daysLeft} дн. до конца</span>
          <span>{formatCHF(dailySafe)} в день</span>
        </div>
      </section>

      <section className="quick-actions" aria-label="Быстрые действия">
        <button onClick={() => setSheet('expense')}>
          <b>−</b>
          <span>Расход</span>
        </button>
        <button onClick={() => setSheet('budget')}>
          <b>±</b>
          <span>Бюджет</span>
        </button>
        <button onClick={() => setSheet('category')}>
          <b>+</b>
          <span>Категория</span>
        </button>
      </section>

      <section className="section-block">
        <div className="section-title">
          <h2>Категории</h2>
          <span>{formatCHF(currentBudget)}</span>
        </div>

        <div className="category-list">
          {storedCategories.map((category) => {
            const spent = spentByCategory.get(category.id) ?? 0
            const remaining = category.allocatedMinor - spent
            const progress =
              category.allocatedMinor > 0
                ? Math.min(100, (spent / category.allocatedMinor) * 100)
                : 0

            return (
              <article className="budget-category" key={category.id}>
                <div className="budget-category__header">
                  <div>
                    <div className="budget-category__title-row">
                      <h3>{category.name}</h3>
                      {category.isPinned && (
                        <span className="pinned-badge">Закреплено</span>
                      )}
                    </div>
                    <span>{formatCHF(spent)} потрачено</span>
                  </div>
                  <div className="budget-category__actions">
                    <strong>{formatCHF(remaining)}</strong>
                    <button
                      className={`category-pin-button ${category.isPinned ? 'category-pin-button--active' : ''}`}
                      type="button"
                      onClick={() => void toggleCategoryPin(category)}
                      aria-pressed={category.isPinned}
                      aria-label={`${category.isPinned ? 'Открепить' : 'Закрепить'} ${category.name}`}
                    >
                      <span className="pin-icon" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div className="progress-track" aria-hidden="true">
                  <div style={{ width: `${progress}%` }} />
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="section-block history-section">
        <div className="section-title">
          <h2>Последние операции</h2>
        </div>

        <div className="history-list">
          {transactions.length === 0 && (
            <p className="empty-state">Пока ни одной операции</p>
          )}

          {transactions.slice(0, 8).map((transaction) => {
            const positive = transaction.direction === 'income'
            const categoryName =
              typeof transaction.categoryId === 'number'
                ? categoryNames.get(transaction.categoryId)
                : undefined

            return (
              <article className="history-row" key={transaction.id}>
                <div className={`history-icon ${positive ? 'history-icon--positive' : ''}`}>
                  {positive ? '+' : '−'}
                </div>
                <div className="history-copy">
                  <strong>{transaction.description}</strong>
                  <span>
                    {categoryName ?? 'Общий бюджет'} · {formatDate(transaction.occurredAt)}
                  </span>
                </div>
                <b className={positive ? 'amount-positive' : ''}>
                  {positive ? '+' : '−'}{formatCHF(transaction.amountMinor)}
                </b>
              </article>
            )
          })}
        </div>
      </section>

      {sheet === 'expense' && (
        <ExpenseSheet
          categories={storedCategories}
          remainingByCategory={new Map(
            storedCategories.map((category) => [
              category.id,
              category.allocatedMinor -
                (spentByCategory.get(category.id) ?? 0),
            ]),
          )}
          onClose={closeSheet}
          onSubmit={async (data) => {
            try {
              await addExpense(data)
              closeSheet()
            } catch (submitError) {
              setError(
                submitError instanceof Error
                  ? submitError.message
                  : 'Не удалось добавить расход',
              )
            }
          }}
          error={error}
        />
      )}

      {sheet === 'budget' && (
        <BudgetSheet
          onClose={closeSheet}
          onSubmit={async (data) => {
            try {
              await changeBudget(data)
              closeSheet()
            } catch (submitError) {
              setError(
                submitError instanceof Error
                  ? submitError.message
                  : 'Не удалось изменить бюджет',
              )
            }
          }}
          error={error}
        />
      )}

      {sheet === 'category' && (
        <CategorySheet
          onClose={closeSheet}
          onSubmit={async (data) => {
            try {
              await addCategory(data)
              closeSheet()
            } catch (submitError) {
              setError(
                submitError instanceof Error
                  ? submitError.message
                  : 'Не удалось добавить категорию',
              )
            }
          }}
          error={error}
        />
      )}
    </main>
  )
}

interface SheetProps {
  onClose: () => void
  error: string
}

function BottomSheet({
  title,
  onClose,
  children,
}: SheetProps & { title: string; children: ReactNode }) {
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="sheet-handle" />
        <header className="sheet-header">
          <h2>{title}</h2>
          <button className="sheet-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}

function ExpenseSheet({
  categories,
  remainingByCategory,
  onClose,
  onSubmit,
  error,
}: SheetProps & {
  categories: StoredCategory[]
  remainingByCategory: Map<number, number>
  onSubmit: (data: {
    categoryId: number
    amountMinor: number
    occurredAt: string
    description: string
  }) => Promise<void>
}) {
  const [categoryId, setCategoryId] = useState(
    categories[0]?.id.toString() ?? '',
  )
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [description, setDescription] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const amountMinor = parseMoneyInput(amount)
    const parsedCategoryId = Number(categoryId)

    if (amountMinor <= 0 || !Number.isInteger(parsedCategoryId)) {
      return
    }

    await onSubmit({
      categoryId: parsedCategoryId,
      amountMinor,
      occurredAt: date,
      description: description.trim(),
    })
  }

  return (
    <BottomSheet title="Новый расход" onClose={onClose} error={error}>
      <form className="sheet-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>Категория</span>
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name} · {formatCHF(remainingByCategory.get(category.id) ?? 0)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Сумма</span>
          <div className="money-field money-field--sheet">
            <input autoFocus inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
            <b>CHF</b>
          </div>
        </label>
        <label>
          <span>Дата</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          <span>Описание</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Например, Carrefour" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" type="submit">Добавить расход</button>
      </form>
    </BottomSheet>
  )
}

function BudgetSheet({ onClose, onSubmit, error }: SheetProps & {
  onSubmit: (data: {
    direction: 'expense' | 'income'
    amountMinor: number
    occurredAt: string
    description: string
  }) => Promise<void>
}) {
  const [direction, setDirection] = useState<'expense' | 'income'>('expense')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(todayISO())
  const [description, setDescription] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const amountMinor = parseMoneyInput(amount)

    if (amountMinor <= 0) {
      return
    }

    await onSubmit({
      direction,
      amountMinor,
      occurredAt: date,
      description: description.trim(),
    })
  }

  return (
    <BottomSheet title="Изменить бюджет" onClose={onClose} error={error}>
      <form className="sheet-form" onSubmit={(event) => void submit(event)}>
        <div className="segmented-control">
          <button type="button" className={direction === 'expense' ? 'active' : ''} onClick={() => setDirection('expense')}>Вычесть</button>
          <button type="button" className={direction === 'income' ? 'active' : ''} onClick={() => setDirection('income')}>Добавить</button>
        </div>
        <label>
          <span>Сумма</span>
          <div className="money-field money-field--sheet">
            <input autoFocus inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
            <b>CHF</b>
          </div>
        </label>
        <label>
          <span>Дата</span>
          <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
        </label>
        <label>
          <span>Описание</span>
          <input value={description} onChange={(event) => setDescription(event.target.value)} placeholder={direction === 'expense' ? 'Например, зал' : 'Например, кэшбэк с зала'} />
        </label>
        <p className="sheet-note">
          {direction === 'expense'
            ? 'Сумма уменьшит остальные категории поровну.'
            : 'Сумма распределится по текущим долям категорий.'}
        </p>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" type="submit">
          {direction === 'expense' ? 'Вычесть из бюджета' : 'Добавить в бюджет'}
        </button>
      </form>
    </BottomSheet>
  )
}

function CategorySheet({ onClose, onSubmit, error }: SheetProps & {
  onSubmit: (data: { name: string; amountMinor: number }) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    const amountMinor = parseMoneyInput(amount)

    if (!name.trim() || amountMinor <= 0) {
      return
    }

    await onSubmit({ name: name.trim(), amountMinor })
  }

  return (
    <BottomSheet title="Новая категория" onClose={onClose} error={error}>
      <form className="sheet-form" onSubmit={(event) => void submit(event)}>
        <label>
          <span>Название</span>
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Например, стрижка" />
        </label>
        <label>
          <span>Лимит</span>
          <div className="money-field money-field--sheet">
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" />
            <b>CHF</b>
          </div>
        </label>
        <p className="sheet-note">Эта сумма будет поровну забрана из остальных категорий.</p>
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button" type="submit">Добавить категорию</button>
      </form>
    </BottomSheet>
  )
}
