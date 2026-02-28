import { formatDate } from '../utils/format.js'

export function renderNewsPanel(news) {
  const container = document.getElementById('news-panel')
  if (!container) return

  if (!news || news.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-sm col-span-3">No draft news available</p>'
    return
  }

  container.innerHTML = news.slice(0, 9).map(item => `
    <a href="${item.url || '#'}" target="_blank" rel="noopener"
       class="block bg-gray-800 rounded-xl p-4 hover:bg-gray-700/50 transition-colors border border-gray-700 hover:border-blue-600">
      ${item.image ? `<img src="${item.image}" alt="" class="w-full h-32 object-cover rounded-lg mb-3 bg-gray-700">` : ''}
      <div class="text-xs text-blue-400 mb-1 uppercase tracking-wider">${item.source || 'ESPN'}</div>
      <h3 class="text-sm font-semibold text-white leading-snug mb-2 line-clamp-2">${item.headline}</h3>
      <p class="text-xs text-gray-400">${formatDate(item.published)}</p>
    </a>`
  ).join('')
}
