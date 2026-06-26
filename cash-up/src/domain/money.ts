const chfFormatter = new Intl.NumberFormat('de-CH', {
  style: 'currency',
  currency: 'CHF',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function toMinorUnits(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('Некорректная денежная сумма')
  }

  return Math.round(value * 100)
}

export function fromMinorUnits(value: number): number {
  return value / 100
}

export function formatCHF(valueMinor: number): string {
  return chfFormatter.format(fromMinorUnits(valueMinor))
}