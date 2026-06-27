export type PeriodStatus = 'active' | 'closed'

export interface BudgetPeriod {
  id?: number
  startDate: string
  endDate: string
  expectedIncomeMinor: number
  status: PeriodStatus
  createdAt: string
}

export interface BudgetCategory {
  id?: number
  periodId: number
  name: string
  allocatedMinor: number
  sortOrder: number
  isArchived: boolean
  isPinned: boolean
}

export type TransactionDirection = 'expense' | 'income'
export type TransactionScope = 'category' | 'budget'

export interface BudgetTransaction {
  id?: number
  periodId: number
  categoryId?: number
  direction: TransactionDirection
  scope: TransactionScope
  amountMinor: number
  occurredAt: string
  description: string
}
