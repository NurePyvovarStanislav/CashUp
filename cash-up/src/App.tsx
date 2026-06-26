import { useEffect } from 'react'

import './App.css'
import { db } from './db/database'

function App() {
  useEffect(() => {
    const openDatabase = async () => {
      try {
        await db.open()
        console.log('CashUp database opened')
      } catch (error) {
        console.error('Failed to open CashUp database:', error)
      }
    }

    void openDatabase()

    return () => {
      db.close()
    }
  }, [])

  return (
    <main className="app">
      <header className="header">
        <p className="eyebrow">Личный бюджет</p>

        <h1>CashUp</h1>

        <p className="period">25 июня — 24 июля</p>
      </header>

      <section className="summary">
        <span>Доступно на жизнь</span>

        <strong>137.00 CHF</strong>

        <small>До следующей выплаты: 29 дней</small>
      </section>

      <section className="categories">
        <article className="category">
          <div>
            <h2>Еда</h2>
            <p>Осталось 90.00 CHF</p>
          </div>

          <button type="button">Добавить расход</button>
        </article>

        <article className="category">
          <div>
            <h2>Сладкое</h2>
            <p>Осталось 20.00 CHF</p>
          </div>

          <button type="button">Добавить расход</button>
        </article>

        <article className="category">
          <div>
            <h2>Бытовое</h2>
            <p>Осталось 27.00 CHF</p>
          </div>

          <button type="button">Добавить расход</button>
        </article>
      </section>

      <section className="refund">
        <div>
          <span>Ожидаемый возврат</span>
          <strong>40.00 CHF</strong>
        </div>

        <button type="button">Возврат получен</button>
      </section>
    </main>
  )
}

export default App