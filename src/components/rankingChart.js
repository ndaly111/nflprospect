import { Chart, registerables } from 'chart.js'
Chart.register(...registerables)

const chartInstances = {}

export function renderRankingChart(containerId, rankHistory) {
  const canvas = document.getElementById(containerId)
  if (!canvas) return

  // Destroy existing instance
  if (chartInstances[containerId]) {
    chartInstances[containerId].destroy()
    delete chartInstances[containerId]
  }

  if (!rankHistory || rankHistory.length === 0) {
    canvas.parentElement.innerHTML = '<p class="text-gray-500 text-sm text-center py-8">No ranking history yet</p>'
    return
  }

  if (rankHistory.length < 2) {
    canvas.parentElement.innerHTML = '<p class="text-gray-600 text-xs text-center py-6">History chart available after more daily refreshes</p>'
    return
  }

  const sorted = [...rankHistory].sort((a, b) => new Date(a.date) - new Date(b.date))
  const labels = sorted.map(r => r.date)
  const data = sorted.map(r => r.rank)
  const minRank = Math.min(...data)
  const maxRank = Math.max(...data)

  chartInstances[containerId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Consensus Rank',
        data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2.5,
        pointRadius: 4,
        pointBackgroundColor: '#3b82f6',
        fill: true,
        tension: 0.3,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          reverse: true, // rank #1 at top
          min: Math.max(1, minRank - 2),
          max: maxRank + 2,
          ticks: {
            color: '#9ca3af',
            stepSize: 1,
            callback: val => `#${val}`,
          },
          grid: { color: '#1f2937' },
        },
        x: {
          ticks: { color: '#9ca3af', maxTicksLimit: 6 },
          grid: { color: '#1f2937' },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `Rank #${ctx.parsed.y}`,
          },
        },
      },
    },
  })
}

export function destroyChart(containerId) {
  if (chartInstances[containerId]) {
    chartInstances[containerId].destroy()
    delete chartInstances[containerId]
  }
}
