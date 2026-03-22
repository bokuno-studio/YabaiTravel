import { useMemo, useCallback } from 'react'
import './PriceHistogramSlider.css'

interface PriceHistogramSliderProps {
  prices: number[]
  min: number
  max: number
  onRangeChange: (min: number, max: number) => void
  currency?: string
  lang?: string
}

const BUCKET_COUNT = 20

function PriceHistogramSlider({ prices, min, max, onRangeChange, currency = '¥', lang }: PriceHistogramSliderProps) {
  const isEn = lang === 'en'
  const { buckets, globalMin, globalMax, step } = useMemo(() => {
    if (prices.length === 0) return { buckets: [], globalMin: 0, globalMax: 0, step: 1 }
    const sorted = [...prices].sort((a, b) => a - b)
    const gMin = 0
    const gMax = Math.ceil(sorted[sorted.length - 1] / 10000) * 10000 || 100000
    const s = Math.max(Math.round((gMax - gMin) / BUCKET_COUNT), 1000)
    const b = new Array(BUCKET_COUNT).fill(0)
    for (const p of sorted) {
      const idx = Math.min(Math.floor((p - gMin) / s), BUCKET_COUNT - 1)
      b[idx]++
    }
    return { buckets: b, globalMin: gMin, globalMax: gMax, step: s }
  }, [prices])

  const maxBucket = Math.max(...buckets, 1)

  const handleMinChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value)
    onRangeChange(Math.min(val, max - step), max)
  }, [max, step, onRangeChange])

  const handleMaxChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value)
    onRangeChange(min, Math.max(val, min + step))
  }, [min, step, onRangeChange])

  if (prices.length === 0) return null

  const formatPrice = (v: number) => {
    if (v >= 10000) return `${currency}${Math.round(v / 1000)}K`
    return `${currency}${v.toLocaleString()}`
  }

  // ハイライト範囲の計算
  const minPct = ((min - globalMin) / (globalMax - globalMin)) * 100
  const maxPct = ((max - globalMin) / (globalMax - globalMin)) * 100

  return (
    <div className="price-histogram-slider">
      <div className="price-histogram-labels">
        <span>{formatPrice(min)}</span>
        <span>{formatPrice(max)}{max >= globalMax ? '+' : ''}</span>
      </div>
      <div className="price-histogram-bars">
        {buckets.map((count, i) => {
          const bucketStart = globalMin + i * step
          const bucketEnd = bucketStart + step
          const inRange = bucketEnd > min && bucketStart < max
          return (
            <div
              key={i}
              className={`price-histogram-bar${inRange ? ' price-histogram-bar--active' : ''}`}
              style={{ height: `${(count / maxBucket) * 100}%` }}
              title={isEn ? `${formatPrice(bucketStart)}-${formatPrice(bucketEnd)}: ${count} events` : `${formatPrice(bucketStart)}〜${formatPrice(bucketEnd)}: ${count}件`}
            />
          )
        })}
      </div>
      <div className="price-slider-track">
        <div
          className="price-slider-range"
          style={{ left: `${minPct}%`, width: `${maxPct - minPct}%` }}
        />
        <input
          type="range"
          className="price-slider price-slider--min"
          min={globalMin}
          max={globalMax}
          step={step}
          value={min}
          onChange={handleMinChange}
        />
        <input
          type="range"
          className="price-slider price-slider--max"
          min={globalMin}
          max={globalMax}
          step={step}
          value={max}
          onChange={handleMaxChange}
        />
      </div>
    </div>
  )
}

export default PriceHistogramSlider
