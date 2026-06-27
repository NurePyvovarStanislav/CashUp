const formatter = new Intl.NumberFormat('de-CH', {
  style: 'currency',
  currency: 'CHF',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function toMinorUnits(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.round(value * 100)
}

export function fromMinorUnits(value: number): number {
  return value / 100
}

export function formatCHF(valueMinor: number): string {
  return formatter.format(fromMinorUnits(valueMinor))
}

export function parseMoneyInput(value: string): number {
  const normalized = value.replace(/\s/g, '').replace(',', '.')
  const parsed = Number(normalized)

  return Number.isFinite(parsed) ? toMinorUnits(parsed) : 0
}

export function moneyInputValue(valueMinor: number): string {
  return (valueMinor / 100).toFixed(2)
}
