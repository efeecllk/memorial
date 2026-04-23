import { motion } from 'motion/react'

type Props = {
  data: number[]
  width?: number
  height?: number
  color?: string
  strokeWidth?: number
  fill?: boolean
}

export function Sparkline({
  data,
  width = 120,
  height = 36,
  color = 'var(--ink-soft)',
  strokeWidth = 1.25,
  fill = false,
}: Props) {
  if (data.length < 2) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const stepX = width / (data.length - 1)

  const points = data.map((v, i) => {
    const x = i * stepX
    const y = height - ((v - min) / range) * (height - 4) - 2
    return [x, y] as const
  })

  const path = points
    .map(([x, y], i) => (i === 0 ? `M ${x.toFixed(2)} ${y.toFixed(2)}` : `L ${x.toFixed(2)} ${y.toFixed(2)}`))
    .join(' ')

  const fillPath = `${path} L ${width} ${height} L 0 ${height} Z`

  const last = points[points.length - 1]

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }} aria-hidden>
      {fill && (
        <motion.path
          d={fillPath}
          fill={color}
          fillOpacity={0.07}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        />
      )}
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
      />
      <motion.circle
        cx={last[0]}
        cy={last[1]}
        r={2.4}
        fill={color}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1.0, duration: 0.3 }}
      />
    </svg>
  )
}
