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
          <p class="text-gray-400 mb-2">How well the player performed in the NFL, based on career stats relative to other players at the same position drafted 2005–2025.</p>
          <ul class="space-y-1">
            <li><span class="text-amber-300 font-bold">Elite</span> — Franchise player, perennial starter, All-Pro caliber (top ~10%)</li>
            <li><span class="text-emerald-300 font-bold">Starter</span> — Solid NFL starter, dependable contributor (~30%)</li>
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

        <section class="border-t border-gray-700/60 pt-4">
          <h3 class="text-white font-semibold mb-2">Methodology</h3>
          <p class="text-gray-400 mb-3">Career grades are computed from nflverse career stats using a position-specific scoring formula, then compared against all other players at that position drafted 2005–2025.</p>

          <h4 class="text-gray-300 font-medium mb-1 text-xs uppercase tracking-wider">Scoring formulas</h4>
          <div class="space-y-1 text-xs font-mono text-gray-400 bg-gray-800/60 rounded-lg p-3 mb-3">
            <div><span class="text-gray-500">QB</span>  pass_yds×1 + pass_td×20 − int×20 + rush_yds×0.5 + rush_td×15 + attempts×0.5</div>
            <div><span class="text-gray-500">RB</span>  rush_yds×1 + rush_td×15 + rec_yds×0.8 + rec_td×15 + rec×0.5</div>
            <div><span class="text-gray-500">WR</span>  rec_yds×1 + rec_td×20 + rec×0.5 + rush_yds×0.5</div>
            <div><span class="text-gray-500">TE</span>  rec_yds×1 + rec_td×20 + rec×0.5</div>
            <div><span class="text-gray-500">DL/EDGE</span> sacks×20 + TFL×5 + tackles×0.5 + QB hits×3</div>
            <div><span class="text-gray-500">LB</span>  sacks×15 + TFL×5 + tackles×1 + int×20 + PD×8</div>
            <div><span class="text-gray-500">DB</span>  int×30 + PD×8 + tackles×0.5</div>
            <div><span class="text-gray-500">OL</span>  offense_snaps×0.1 + games_started×3 (full starter ≈ 160 pts/season)</div>
          </div>

          <h4 class="text-gray-300 font-medium mb-1 text-xs uppercase tracking-wider">Accolade bonuses (added to score)</h4>
          <div class="grid grid-cols-2 gap-x-4 text-xs text-gray-400 mb-3">
            <div>AP1 selection: +100 each</div>
            <div>AP2 selection: +50 each</div>
            <div>MVP: +150</div>
            <div>SB MVP: +80</div>
            <div>OPOY / DPOY: +80</div>
            <div>OROY / DROY: +40</div>
            <div>CPOY: +30</div>
          </div>

          <h4 class="text-gray-300 font-medium mb-1 text-xs uppercase tracking-wider">Tier cutoffs (percentile vs. same position)</h4>
          <div class="text-xs text-gray-400 space-y-0.5">
            <div><span class="text-amber-300 font-semibold">Elite</span> — 88th+ pct + strong accolade (AP1/AP2/OPOY/DPOY/MVP); or 3+ Pro Bowls at 65th+ pct; or 2+ Pro Bowls at 82nd+ pct (q≥2 required)</div>
            <div class="text-gray-500 pl-3">OL/TE Elite: 88th+ pct + 2 AP selections OR 2 Pro Bowls; or 3+ Pro Bowls at 50th+ pct; or 2+ Pro Bowls at 70th+ pct</div>
            <div><span class="text-emerald-300 font-semibold">Starter</span> — 60th–87th percentile</div>
            <div><span class="text-slate-300 font-semibold">Backup</span> — 30th–59th percentile</div>
            <div><span class="text-red-300 font-semibold">Bust</span> — below 30th percentile</div>
          </div>
          <p class="text-gray-600 mt-1 text-xs">OL qualifying season: ≥500 offensive snaps or ≥8 games started. Skill position qualifying season: ≥4 games played. Note: OL snap data is only available from 2012 onward — pre-2012 OL without accolades may show as ungraded.</p>
          <p class="text-gray-600 mt-2 text-xs">Players with 0 qualifying seasons after 2+ NFL seasons (3+ for QB/OL) receive a <span class="text-red-300">Bust</span> grade. Players with fewer than 2 qualifying seasons and no strong accolade receive a <span class="text-gray-400">~provisional</span> grade — too early to evaluate against multi-year careers.</p>
        </section>

      </div>
    </div>`

  document.body.appendChild(modal)

  document.getElementById('glossary-close').addEventListener('click', () => modal.classList.add('hidden'))
  modal.addEventListener('click', e => { if (e.target === modal) modal.classList.add('hidden') })
}
