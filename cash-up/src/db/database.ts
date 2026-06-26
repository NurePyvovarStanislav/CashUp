import Dexie, { type Table } from 'dexie'

import type {
  BudgetCategory,
  BudgetPeriod,
  BudgetTransaction,
  PendingRefund,
} from '../domain/models'

class CashUpDatabase extends Dexie {
  periods!: Table<BudgetPeriod, number>
  categories!: Table<BudgetCategory, number>
  transactions!: Table<BudgetTransaction, number>
  pendingRefunds!: Table<PendingRefund, number>

  constructor() {
    super('cashup-database')

    this.version(1).stores({
      periods: '++id,startDate,endDate',
      categories: '++id,periodId,sortOrder,isArchived',
      transactions:
        '++id,periodId,categoryId,type,occurredAt',
      pendingRefunds:
        '++id,periodId,status,expectedAt',
    })
  }
}

export const db = new CashUpDatabase()