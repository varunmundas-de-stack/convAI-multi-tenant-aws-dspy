import {
  Chart as ChartJS,
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement,
  Title, Tooltip, Legend, Filler,
} from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'

ChartJS.register(
  CategoryScale, LinearScale, BarElement, LineElement, PointElement,
  ArcElement,
  Title, Tooltip, Legend, Filler,
)

const PALETTE = [
  { bg: 'rgba(102,126,234,0.7)', border: '#667eea' },
  { bg: 'rgba(54,162,235,0.7)',  border: '#36a2eb' },
  { bg: 'rgba(75,192,192,0.7)',  border: '#4bc0c0' },
  { bg: 'rgba(255,99,132,0.7)',  border: '#ff6384' },
  { bg: 'rgba(255,159,64,0.7)',  border: '#ff9f40' },
  { bg: 'rgba(153,102,255,0.7)', border: '#9966ff' },
  { bg: 'rgba(76,175,80,0.7)',   border: '#4caf50' },
  { bg: 'rgba(255,206,86,0.7)',  border: '#ffce56' },
]

export default function DataChart({ data, chartType }) {
  if (!data?.length || data.length < 2) return null

  const cols  = Object.keys(data[0])
  const label = cols[0]
  const value = cols[1]

  const secondVal = data[0][value]
  if (typeof secondVal !== 'number' && isNaN(parseFloat(secondVal))) return null

  const labels = data.map(r => String(r[label]))
  const values = data.map(r => parseFloat(r[value]) || 0)

  // Doughnut chart
  if (chartType === 'doughnut') {
    const doughnutData = {
      labels,
      datasets: [{
        data: values,
        backgroundColor: data.map((_, i) => PALETTE[i % PALETTE.length].bg),
        borderColor:     data.map((_, i) => PALETTE[i % PALETTE.length].border),
        borderWidth: 2,
      }],
    }
    const doughnutOptions = {
      responsive: true,
      maintainAspectRatio: true,
      plugins: {
        legend: {
          display: true,
          position: 'right',
          labels: { font: { size: 11 }, padding: 8 },
        },
        tooltip: {
          callbacks: {
            label: ctx => {
              const v = ctx.parsed
              return ` ${ctx.label}: ${v >= 1_000_000
                ? `${(v / 1_000_000).toFixed(1)}M`
                : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : v}`
            },
          },
        },
      },
    }
    return (
      <div className="mt-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
        <Doughnut data={doughnutData} options={doughnutOptions} />
      </div>
    )
  }

  // Auto-detect bar vs line
  const isLine = chartType === 'line' || (chartType === undefined && data.length > 10)

  const bgColors     = isLine ? PALETTE[0].bg     : data.map((_, i) => PALETTE[i % PALETTE.length].bg)
  const borderColors = isLine ? PALETTE[0].border  : data.map((_, i) => PALETTE[i % PALETTE.length].border)

  const chartData = {
    labels,
    datasets: [{
      label: value,
      data: values,
      backgroundColor: bgColors,
      borderColor: borderColors,
      borderWidth: 2,
      fill: isLine,
      tension: isLine ? 0.3 : 0,
      pointRadius: isLine ? 3 : 0,
    }],
  }

  const options = {
    responsive: true,
    maintainAspectRatio: true,
    plugins: {
      legend: { display: false },
      title: {
        display: true,
        text: `${value} by ${label}`,
        font: { size: 12 },
        color: '#6b7280',
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          font: { size: 11 },
          callback: v => v >= 1_000_000
            ? `${(v / 1_000_000).toFixed(1)}M`
            : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : v,
        },
        grid: { color: 'rgba(0,0,0,0.04)' },
      },
      x: {
        ticks: { font: { size: 10 }, maxRotation: 45 },
        grid: { display: false },
      },
    },
  }

  const Component = isLine ? Line : Bar

  return (
    <div className="mt-3 bg-gray-50 rounded-lg p-3 border border-gray-100">
      <Component data={chartData} options={options} />
    </div>
  )
}
