import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'

import { db } from '../../db/database'
import {
  addAllocationItem,
  removeAllocationItem,
  setTargetAllocation,
} from '../../domain/allocation'
import {
  formatCHF,
  moneyInputValue,
  parseMoneyInput,
} from '../../domain/money'

interface DraftCategory {
  id: string
  name: string
  allocatedMinor: number
  isPinned: boolean
}

const recommendations = [
  { name: 'Накопления', percent: 50 },
  { name: 'Еда', percent: 25 },
  { name: 'Обязательные', percent: 10 },
  { name: 'Бытовое', percent: 5 },
  { name: 'Сладкое', percent: 5 },
  { name: 'Резерв', percent: 5 },
]

function toLocalISO(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}

function createDefaultEndDate(startDate: string): string {
  const date = new Date(`${startDate}T12:00:00`)
  date.setMonth(date.getMonth() + 1)
  date.setDate(date.getDate() - 1)
  return toLocalISO(date)
}

function createRecommendedCategories(
  incomeMinor: number,
): DraftCategory[] {
  let assigned = 0

  return recommendations.map((item, index) => {
    const isLast = index === recommendations.length - 1
    const allocatedMinor = isLast
      ? incomeMinor - assigned
      : Math.floor((incomeMinor * item.percent) / 100)

    assigned += allocatedMinor

    return {
      id: crypto.randomUUID(),
      name: item.name,
      allocatedMinor,
      isPinned: false,
    }
  })
}

export function OnboardingScreen() {
  const today = useMemo(() => toLocalISO(new Date()), [])
  const [step, setStep] = useState<1 | 2>(1)
  const [incomeInput, setIncomeInput] = useState('484.00')
  const [startDate, setStartDate] = useState(today)
  const [endDate, setEndDate] = useState(createDefaultEndDate(today))
  const [categories, setCategories] = useState<DraftCategory[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryAmount, setNewCategoryAmount] = useState('')
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const incomeMinor = parseMoneyInput(incomeInput)
  const allocatedMinor = categories.reduce(
    (sum, category) => sum + category.allocatedMinor,
    0,
  )
  const pinnedIds = new Set(
    categories
      .filter((category) => category.isPinned)
      .map((category) => category.id),
  )

  function continueToAllocation(event: FormEvent) {
    event.preventDefault()
    setError('')

    if (incomeMinor <= 0) {
      setError('Укажи ожидаемый доход')
      return
    }

    if (!startDate || !endDate || endDate < startDate) {
      setError('Проверь даты бюджетного периода')
      return
    }

    setCategories(createRecommendedCategories(incomeMinor))
    setStep(2)
  }

  function changeCategoryAmount(id: string, value: string) {
    const result = setTargetAllocation(
      categories,
      id,
      Math.max(0, parseMoneyInput(value)),
      new Map(),
      pinnedIds,
    )

    if (result.error) {
      setError(result.error)
      return
    }

    setError('')
    setCategories(result.items)
  }

  function changeCategoryPercent(id: string, value: string) {
    const normalized = Number(value.replace(',', '.'))
    const percent = Number.isFinite(normalized) ? normalized : 0
    const targetAmount = Math.round(
      incomeMinor * (Math.max(0, percent) / 100),
    )

    changeCategoryAmount(id, moneyInputValue(targetAmount))
  }

  function addCategory(event: FormEvent) {
    event.preventDefault()
    const name = newCategoryName.trim()
    const amountMinor = parseMoneyInput(newCategoryAmount)

    if (!name || amountMinor <= 0) {
      setError('Укажи название и сумму новой категории')
      return
    }

    const result = addAllocationItem(categories, {
      id: crypto.randomUUID(),
      name,
      allocatedMinor: amountMinor,
      isPinned: false,
    }, new Map(), pinnedIds)

    if (result.error) {
      setError(result.error)
      return
    }

    setCategories(result.items)
    setNewCategoryName('')
    setNewCategoryAmount('')
    setError('')
  }

  function toggleCategoryPin(id: string) {
    setCategories((current) =>
      current.map((category) =>
        category.id === id
          ? { ...category, isPinned: !category.isPinned }
          : category,
      ),
    )
    setError('')
  }

  function deleteCategory(id: string) {
    const result = removeAllocationItem(categories, id, pinnedIds)

    if (result.error) {
      setError(result.error)
      return
    }

    setCategories(result.items)
    setError('')
  }

  async function saveBudget() {
    if (allocatedMinor !== incomeMinor) {
      setError('Распределение должно совпадать с доходом')
      return
    }

    setIsSaving(true)
    setError('')

    try {
      await db.transaction('rw', db.periods, db.categories, async () => {
        const periodId = await db.periods.add({
          startDate,
          endDate,
          expectedIncomeMinor: incomeMinor,
          status: 'active',
          createdAt: new Date().toISOString(),
        })

        await db.categories.bulkAdd(
          categories.map((category, index) => ({
            periodId,
            name: category.name,
            allocatedMinor: category.allocatedMinor,
            sortOrder: index,
            isArchived: false,
            isPinned: category.isPinned,
          })),
        )
      })
    } catch (saveError) {
      console.error(saveError)
      setError('Не удалось сохранить бюджет')
    } finally {
      setIsSaving(false)
    }
  }

  if (step === 1) {
    return (
      <main className="app-shell onboarding">
        <header className="page-header page-header--large">
          <span className="overline">CashUp</span>
          <h1>Новый бюджет</h1>
          <p>Укажи доход и период. Покупки планировать не придётся.</p>
        </header>

        <form className="ios-group" onSubmit={continueToAllocation}>
          <label className="ios-row ios-row--field">
            <span>Ожидаемый доход</span>
            <span className="money-field">
              <input
                autoFocus
                inputMode="decimal"
                value={incomeInput}
                onChange={(event) => setIncomeInput(event.target.value)}
                aria-label="Ожидаемый доход"
              />
              <b>CHF</b>
            </span>
          </label>

          <label className="ios-row ios-row--field">
            <span>Начало периода</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => {
                const value = event.target.value
                setStartDate(value)
                setEndDate(createDefaultEndDate(value))
              }}
            />
          </label>

          <label className="ios-row ios-row--field">
            <span>Конец периода</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
        </form>

        {error && <p className="form-error">{error}</p>}

        <div className="sticky-action">
          <button className="primary-button" onClick={continueToAllocation}>
            Продолжить
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell onboarding">
      <header className="page-header">
        <button className="text-button" onClick={() => setStep(1)}>
          Назад
        </button>
        <span className="overline">Распределение</span>
        <h1>{formatCHF(incomeMinor)}</h1>
        <p>Закрепи важные суммы — автоматическое перераспределение их не изменит.</p>
      </header>

      <section className="allocation-list" aria-label="Категории бюджета">
        {categories.map((category) => {
          const percent =
            incomeMinor > 0
              ? (category.allocatedMinor / incomeMinor) * 100
              : 0

          return (
            <article className="allocation-card" key={category.id}>
              <div className="allocation-card__top">
                <input
                  className="category-name-input"
                  value={category.name}
                  onChange={(event) =>
                    setCategories((current) =>
                      current.map((item) =>
                        item.id === category.id
                          ? { ...item, name: event.target.value }
                          : item,
                      ),
                    )
                  }
                  aria-label="Название категории"
                />

                <button
                  className={`pin-button ${category.isPinned ? 'pin-button--active' : ''}`}
                  type="button"
                  onClick={() => toggleCategoryPin(category.id)}
                  aria-pressed={category.isPinned}
                  aria-label={`${category.isPinned ? 'Открепить' : 'Закрепить'} ${category.name}`}
                >
                  <span className="pin-icon" aria-hidden="true" />
                  <span>{category.isPinned ? 'Закреплено' : 'Закрепить'}</span>
                </button>

                <button
                  className="icon-button icon-button--danger"
                  type="button"
                  onClick={() => deleteCategory(category.id)}
                  aria-label={`Удалить ${category.name}`}
                >
                  −
                </button>
              </div>

              <div className="allocation-fields">
                <label>
                  <span>Сумма</span>
                  <div className="compact-input">
                    <input
                      inputMode="decimal"
                      value={moneyInputValue(category.allocatedMinor)}
                      onChange={(event) =>
                        changeCategoryAmount(
                          category.id,
                          event.target.value,
                        )
                      }
                    />
                    <b>CHF</b>
                  </div>
                </label>

                <label>
                  <span>Процент</span>
                  <div className="compact-input compact-input--percent">
                    <input
                      inputMode="decimal"
                      value={percent.toFixed(1)}
                      onChange={(event) =>
                        changeCategoryPercent(
                          category.id,
                          event.target.value,
                        )
                      }
                    />
                    <b>%</b>
                  </div>
                </label>
              </div>
            </article>
          )
        })}
      </section>

      <form className="add-category-card" onSubmit={addCategory}>
        <h2>Новая категория</h2>
        <input
          placeholder="Например, стрижка"
          value={newCategoryName}
          onChange={(event) => setNewCategoryName(event.target.value)}
        />
        <div className="money-field money-field--wide">
          <input
            placeholder="0.00"
            inputMode="decimal"
            value={newCategoryAmount}
            onChange={(event) => setNewCategoryAmount(event.target.value)}
          />
          <b>CHF</b>
        </div>
        <button className="secondary-button" type="submit">
          Добавить категорию
        </button>
      </form>

      <div className="allocation-total">
        <span>Распределено</span>
        <strong>{formatCHF(allocatedMinor)}</strong>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="sticky-action">
        <button
          className="primary-button"
          onClick={() => void saveBudget()}
          disabled={isSaving}
        >
          {isSaving ? 'Сохраняю…' : 'Создать бюджет'}
        </button>
      </div>
    </main>
  )
}
