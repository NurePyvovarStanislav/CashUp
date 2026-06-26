export interface BudgetPeriod {
  id?: number

  startDate: string
  endDate: string

  incomeMinor: number
  savingsMinor: number

  createdAt: string
}

export interface BudgetCategory {
  id?: number
  periodId: number

  name: string
  allocatedMinor: number

  icon?: string
  sortOrder: number
  isArchived: boolean
}

export type TransactionType =
  | 'expense'
  | 'income'
  | 'refund'
  | 'transfer'

export interface BudgetTransaction {
  id?: number
  periodId: number
  categoryId?: number

  type: TransactionType
  amountMinor: number

  occurredAt: string
  note?: string
}

export type RefundStatus = 'pending' | 'received'

export interface PendingRefund {
  id?: number
  periodId: number

  name: string
  amountMinor: number
  status: RefundStatus

  expectedAt?: string
  receivedAt?: string
}