export function initGlossaryModal() {
  const modal = document.createElement('div')
  modal.id = 'glossary-modal'
  modal.className = 'hidden fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70'
  modal.innerHTML = `
    <div class="bg-gray-900 border border-gray-700 rounded-xl max-w-lg w-full max-h-[80vh] overflow-y-auto p-6 shadow-2xl">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-lg font-bold text-white">How to read historical draft cards</h2>
        <button id="glossary-close" class="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
      </div>
      <div class="space-y-4 text-sm text-gray-300">

        <section>
          <h3 class="text-white font-semibold mb-1">Career Grade</h3>
          <p class="text-gray-400 mb-2">How well the player performed in the NFL, based on career stats relative to other players at the same position drafted 2020–2025.</p>
          <ul class="space-y-1">
            <li><span class="text-amber-300 font-bold">Elite</span> — Franchise player, perennial starter, All-Pro caliber (top ~15%)</li>
            <li><span class="text-emerald-300 font-bold">Starter</span> — Solid NFL starter, dependable contributor (~25%)</li>
            <li><span class="text-slate-300 font-bold">Backup</span> — Rotational player or depth contributor (~30%)</li>
            <li><span class="text-red-300 font-bold">Bust</span> — Minimal NFL impact, didn't stick (~30%)</li>
          </ul>
          <p class="text-gray-500 mt-2 text-xs">A <span class="text-gray-400">~</span> prefix (e.g. ~Starter) means fewer than 3 seasons have been evaluated — the grade may change.</p>
        </section>

        <section>
          <h3 class="text-white font-semibold mb-1">Class Rank ("1st in class")</h3>
          <p class="text-gray-400">Players within the same draft year are ranked by career NFL production from best to worst. #1 in class = the best career of anyone drafted that year, regardless of what pick they were.</p>
        </section>

        <section>
          <h3 class="text-white font-semibold mb-1">Pick Value badge ("+6" / "−6")</h3>
          <p class="text-gray-400">Compares ESPN's pre-draft ranking to the actual pick number.</p>
          <ul class="space-y-1 mt-1">
            <li><span class="text-emerald-400 font-bold">+6 Value</span> — Team waited 6 spots longer than ESPN ranked the player (a steal)</li>
            <li><span class="text-red-400 font-bold">−6 Reach</span> — Team picked 6 spots earlier than ESPN ranked them</li>
          </ul>
          <p class="text-gray-500 mt-1 text-xs">Only shown for differences of 5+ spots.</p>
        </section>

        <section>
          <h3 class="text-white font-semibold mb-1">ESPN Pre-Draft Rank</h3>
          <p class="text-gray-400">Where ESPN ranked the prospect among all players before the draft. #1 = the top prospect that year. This is the scouting evaluation, not the draft result.</p>
        </section>

        <section>
          <h3 class="text-white font-semibold mb-1">ESPN Grade (e.g. 94)</h3>
          <p class="text-gray-400">ESPN's 0–99 pre-draft evaluation score. Grades above 90 typically go to first-round locks; 85–89 to late first/early second round prospects.</p>
        </section>

        <section>
          <h3 class="text-white font-semibold mb-1">Accolades</h3>
          <ul class="space-y-1">
            <li><span class="text-yellow-400 font-bold">AP1</span> — AP First-Team All-Pro (voted best in the NFL at their position)</li>
            <li><span class="text-gray-300 font-bold">AP2</span> — AP Second-Team All-Pro</li>
            <li><span class="text-emerald-300 font-bold">OROY</span> — Offensive Rookie of the Year</li>
            <li><span class="text-orange-300 font-bold">DROY</span> — Defensive Rookie of the Year</li>
            <li><span class="text-green-300 font-bold">OPOY</span> — Offensive Player of the Year</li>
            <li><span class="text-red-300 font-bold">DPOY</span> — Defensive Player of the Year</li>
            <li><span class="text-purple-300 font-bold">MVP</span> — League MVP</li>
            <li><span class="text-sky-300 font-bold">CPOY</span> — Clutch Player of the Year</li>
          </ul>
          <p class="text-gray-500 mt-1 text-xs">A number prefix (e.g. 3× AP1) means the player won that award multiple times.</p>
        </section>

      </div>
    </div>`

  document.body.appendChild(modal)

  document.getElementById('glossary-close').addEventListener('click', () => modal.classList.add('hidden'))
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden') })
}
