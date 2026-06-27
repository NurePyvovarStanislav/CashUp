import Dexie, { type Table } from 'dexie'

import type {
  BudgetCategory,
  BudgetPeriod,
  BudgetTransaction,
} from '../domain/models'

class CashUpDatabase extends Dexie {
  periods!: Table<BudgetPeriod, number>
  categories!: Table<BudgetCategory, number>
  transactions!: Table<BudgetTransaction, number>

  constructor() {
    super('cashup-database')

    this.version(1).stores({
      periods: '++id,startDate,endDate',
      categories: '++id,periodId,sortOrder,isArchived',
      transactions: '++id,periodId,categoryId,type,occurredAt',
      pendingRefunds: '++id,periodId,status,expectedAt',
    })

    this.version(2).stores({
      periods: '++id,status,startDate,endDate,createdAt',
      categories: '++id,periodId,sortOrder,isArchived',
      transactions:
        '++id,periodId,categoryId,scope,direction,occurredAt',
      pendingRefunds: null,
    })

    this.version(3)
      .stores({
        periods: '++id,status,startDate,endDate,createdAt',
        categories:
          '++id,periodId,sortOrder,isArchived,isPinned',
        transactions:
          '++id,periodId,categoryId,scope,direction,occurredAt',
      })
      .upgrade(async (transaction) => {
        await transaction
          .table<BudgetCategory, number>('categories')
          .toCollection()
          .modify((category) => {
            category.isPinned = false
          })
      })
  }
}

export const db = new CashUpDatabase()
