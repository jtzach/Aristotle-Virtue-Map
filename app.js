(() => {
  const data = VIRTUEMAP_DATA;
  const virtues = data.virtues;
  const dilemmas = data.dilemmas;
  const models = DEMO_LLM_PROFILES;
  const state = {
    current: 0,
    rankings: {},
    status: {}, // pending | answered | skipped
  };
  const colors = {
    wisdom: '#456fe8',
    justice: '#199a8f',
    truthfulness: '#c59a45',
    courage: '#7a5fd2',
    temperance: '#c66a7b'
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    dilemmas.forEach(d => {
      state.rankings[d.id] = Object.keys(d.options);
      state.status[d.id] = 'pending';
    });
    bindNavigation();
    renderVirtues();
    drawPentagon();
    renderLlmGrid('homeLlmGrid');
    renderDilemma();
    renderResults();
  }

  function bindNavigation() {
    byId('startBtn').addEventListener('click', () => showScreen('surveyScreen'));
    byId('previewResultsBtn').addEventListener('click', () => showScreen('resultsScreen'));
    byId('backHomeBtn').addEventListener('click', () => showScreen('homeScreen'));
    byId('restartBtn').addEventListener('click', () => {
      state.current = 0;
      dilemmas.forEach(d => { state.status[d.id] = 'pending'; state.rankings[d.id] = Object.keys(d.options); });
      renderDilemma();
      renderResults();
      showScreen('homeScreen');
    });
    byId('prevBtn').addEventListener('click', () => { state.current = Math.max(0, state.current - 1); renderDilemma(); });
    byId('skipBtn').addEventListener('click', () => { markCurrent('skipped'); nextOrResults(); });
    byId('submitRankingBtn').addEventListener('click', () => { markCurrent('answered'); nextOrResults(); });
  }

  function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    byId(id).classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (id === 'resultsScreen') renderResults();
  }

  function markCurrent(status) {
    const d = dilemmas[state.current];
    state.status[d.id] = status;
    persistCurrentRanking();
  }

  function nextOrResults() {
    if (state.current < dilemmas.length - 1) {
      state.current += 1;
      renderDilemma();
    } else {
      renderResults();
      showScreen('resultsScreen');
    }
  }

  function renderVirtues() {
    const box = byId('virtueDefinitions');
    box.innerHTML = virtues.map(v => `
      <article class="virtue-card">
        <h3>${escapeHtml(v.name)}</h3>
        <small>${escapeHtml(v.greek)}</small>
        <p>${escapeHtml(v.definition)}</p>
      </article>
    `).join('');
  }

  function renderDilemma() {
    const d = dilemmas[state.current];
    const answered = countStatus('answered');
    const skipped = countStatus('skipped');
    byId('progressText').textContent = `Dilemma ${state.current + 1}/${dilemmas.length}`;
    byId('answeredText').textContent = `${answered} answered · ${skipped} skipped`;
    byId('progressFill').style.width = `${((state.current + 1) / dilemmas.length) * 100}%`;
    const status = state.status[d.id];
    const statusLabel = status === 'answered' ? 'Already submitted' : status === 'skipped' ? 'Already skipped' : 'Not submitted yet';
    byId('dilemmaCard').innerHTML = `
      <p class="eyebrow">${escapeHtml(statusLabel)}</p>
      <h2>${escapeHtml(d.title)}</h2>
      <p class="scenario">${escapeHtml(d.scenario)}</p>
      <div class="rank-hint"><span>Drag responses into your preferred order</span><span>Most preferred ↑</span></div>
      <ol class="option-list" id="optionList"></ol>
    `;
    renderOptionList(d);
    byId('prevBtn').disabled = state.current === 0;
    byId('prevBtn').style.opacity = state.current === 0 ? .45 : 1;
  }

  function renderOptionList(d) {
    const list = byId('optionList');
    list.innerHTML = '';
    state.rankings[d.id].forEach(opt => {
      const li = document.createElement('li');
      li.className = 'option';
      li.draggable = true;
      li.dataset.option = opt;
      li.innerHTML = `
        <span class="option-label">${opt}</span>
        <span class="option-text">${escapeHtml(d.options[opt])}</span>
        <span class="option-tools"><button title="Move up" data-move="up">↑</button><button title="Move down" data-move="down">↓</button></span>
      `;
      list.appendChild(li);
    });
    attachDrag(list);
    list.addEventListener('click', e => {
      const btn = e.target.closest('button[data-move]');
      if (!btn) return;
      const li = btn.closest('.option');
      const direction = btn.dataset.move;
      if (direction === 'up' && li.previousElementSibling) list.insertBefore(li, li.previousElementSibling);
      if (direction === 'down' && li.nextElementSibling) list.insertBefore(li.nextElementSibling, li);
      persistCurrentRanking();
    });
  }

  function attachDrag(list) {
    let dragged = null;
    list.querySelectorAll('.option').forEach(item => {
      item.addEventListener('dragstart', () => { dragged = item; setTimeout(() => item.classList.add('dragging'), 0); });
      item.addEventListener('dragend', () => { item.classList.remove('dragging'); dragged = null; persistCurrentRanking(); });
    });
    list.addEventListener('dragover', e => {
      e.preventDefault();
      const after = getDragAfterElement(list, e.clientY);
      if (!dragged) return;
      if (!after) list.appendChild(dragged); else list.insertBefore(dragged, after);
    });
  }

  function getDragAfterElement(container, y) {
    const els = [...container.querySelectorAll('.option:not(.dragging)')];
    return els.reduce((closest, child) => {
      const box = child.getBoundingClientRect();
      const offset = y - box.top - box.height / 2;
      if (offset < 0 && offset > closest.offset) return { offset, element: child };
      return closest;
    }, { offset: Number.NEGATIVE_INFINITY }).element;
  }

  function persistCurrentRanking() {
    const d = dilemmas[state.current];
    const list = byId('optionList');
    if (!list) return;
    state.rankings[d.id] = [...list.querySelectorAll('.option')].map(el => el.dataset.option);
  }

  function computeProfile() {
    const answered = dilemmas.filter(d => state.status[d.id] === 'answered');
    const scores = Object.fromEntries(virtues.map(v => [v.id, []]));
    answered.forEach(d => {
      const ranking = state.rankings[d.id];
      virtues.forEach(v => {
        scores[v.id].push(scoreRankingAgainstVirtue(ranking, d.proposed[v.id]));
      });
    });
    const profile = { answeredCount: answered.length, scores: {} };
    virtues.forEach(v => {
      profile.scores[v.id] = scores[v.id].length ? mean(scores[v.id]) : null;
    });
    return profile;
  }

  function scoreRankingAgainstVirtue(userRanking, virtueOrder) {
    const pref = {}, expr = {};
    userRanking.forEach((opt, idx) => pref[opt] = 5 - idx);
    virtueOrder.forEach((opt, idx) => expr[opt] = 5 - idx);
    let dot = 0;
    Object.keys(pref).forEach(opt => dot += pref[opt] * expr[opt]);
    const min = 35, max = 55;
    return clamp(100 * (dot - min) / (max - min), 0, 100);
  }

  function renderResults() {
    const profile = computeProfile();
    drawRadar(byId('userRadar'), profile.scores, 'Your VirtueMap', profile.answeredCount ? '' : 'No submitted rankings yet');
    const valid = virtues.map(v => ({...v, value: profile.scores[v.id]})).filter(v => v.value != null).sort((a,b) => b.value - a.value);
    if (!profile.answeredCount) {
      byId('resultTitle').textContent = 'Your VirtueMap';
      byId('resultSummary').textContent = 'Submit at least one dilemma to generate a profile. You can answer only a subset for a fast demo.';
      byId('closestModels').innerHTML = '<p class="muted">No submitted rankings yet.</p>';
    } else {
      const top = valid[0], second = valid[1];
      const arch = archetypeFor(top.id, second.id);
      byId('resultTitle').textContent = arch.title;
      byId('resultSummary').innerHTML = `${arch.text}<br><br><b>Strongest dimensions:</b> ${top.name} (${Math.round(top.value)}) and ${second.name} (${Math.round(second.value)}). <b>Profile confidence:</b> ${confidenceLabel(profile.answeredCount)} (${profile.answeredCount}/7 dilemmas submitted).`;
      renderClosest(profile);
    }
    renderLlmGrid('resultsLlmGrid');
  }

  function renderClosest(profile) {
    const hits = models.map(m => ({ model:m, sim:centeredCosinePercent(profile.scores, m.profile) }))
      .sort((a,b) => b.sim - a.sim).slice(0,3);
    byId('closestModels').innerHTML = hits.map((h,i) => `
      <div class="closest-hit">
        <div>${i+1}. ${escapeHtml(h.model.name)}<small>${escapeHtml(h.model.family)} · consistency ${h.model.consistency}%</small></div>
        <div class="similarity">${h.sim}%</div>
      </div>
    `).join('');
  }

  function renderLlmGrid(containerId) {
    const container = byId(containerId);
    if (!container) return;
    container.innerHTML = '';
    models.forEach(m => {
      const card = document.createElement('article');
      card.className = 'llm-card temple-card';
      card.innerHTML = `
        <h3>${escapeHtml(m.name)} <span>${m.consistency}% stable</span></h3>
        <p>${escapeHtml(m.family)} · ${escapeHtml(m.note)}</p>
        <canvas width="360" height="300" aria-label="${escapeHtml(m.name)} radar chart"></canvas>
      `;
      container.appendChild(card);
      drawRadar(card.querySelector('canvas'), m.profile, m.name, '');
    });
  }

  function drawPentagon() {
    const canvas = byId('virtuePentagon');
    const scores = Object.fromEntries(virtues.map(v => [v.id, 72]));
    drawRadar(canvas, scores, 'The virtue pentagon', 'Five axes, one profile');
  }

  function drawRadar(canvas, scores, title, subtitle) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0,0,w,h);
    const cx = w/2, cy = h/2 + 12, radius = Math.min(w,h) * 0.32;
    const n = virtues.length;
    const scaleMin = 50; // scores remain 0-100; display is zoomed to 50-100 for legibility
    const scaleMax = 100;
    const toDisplayRadius = (value) => clamp((value - scaleMin) / (scaleMax - scaleMin), 0, 1);
    ctx.save();
    ctx.fillStyle = '#fffaf2'; ctx.fillRect(0,0,w,h);
    ctx.strokeStyle = 'rgba(185,139,52,.25)'; ctx.lineWidth = 2;
    for (let ring=1; ring<=4; ring++) drawPoly(ctx, cx, cy, radius*ring/4, n, -Math.PI/2, false);
    // scale labels for the zoomed pentagon
    ctx.fillStyle = 'rgba(20,27,51,.48)';
    ctx.font = '700 10px Inter, Arial';
    ctx.textAlign = 'center';
    ctx.fillText('50', cx, cy + 4);
    ctx.fillText('75', cx, cy - radius*0.5 + 4);
    ctx.fillText('100', cx, cy - radius + 4);
    virtues.forEach((v,i) => {
      const a = -Math.PI/2 + i*2*Math.PI/n;
      ctx.beginPath(); ctx.moveTo(cx,cy); ctx.lineTo(cx+Math.cos(a)*radius, cy+Math.sin(a)*radius); ctx.strokeStyle='rgba(18,24,47,.12)'; ctx.stroke();
    });
    const points = virtues.map((v,i) => {
      const val = scores && scores[v.id] != null ? scores[v.id] : scaleMin;
      const a = -Math.PI/2 + i*2*Math.PI/n;
      const r = radius * toDisplayRadius(val);
      return [cx+Math.cos(a)*r, cy+Math.sin(a)*r, val, v, a];
    });
    const grad = ctx.createRadialGradient(cx,cy,0,cx,cy,radius);
    grad.addColorStop(0,'rgba(69,111,232,.25)'); grad.addColorStop(.65,'rgba(25,154,143,.22)'); grad.addColorStop(1,'rgba(197,154,69,.34)');
    ctx.beginPath(); points.forEach((p,i)=> i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1])); ctx.closePath(); ctx.fillStyle=grad; ctx.fill(); ctx.strokeStyle='#28396e'; ctx.lineWidth=3; ctx.stroke();
    points.forEach(([x,y,val,v])=>{ctx.beginPath();ctx.arc(x,y,4.5,0,2*Math.PI);ctx.fillStyle=colors[v.id]||'#333';ctx.fill();});
    virtues.forEach((v,i)=>{
      const a=-Math.PI/2+i*2*Math.PI/n;
      const lx=cx+Math.cos(a)*(radius+48), ly=cy+Math.sin(a)*(radius+42);
      ctx.fillStyle='#141b33'; ctx.font='700 13px Inter, Arial'; ctx.textAlign= lx<cx-10 ? 'right' : lx>cx+10 ? 'left' : 'center'; ctx.textBaseline='middle';
      wrapText(ctx, v.name, lx, ly, 96, 15);
    });
    ctx.fillStyle='#141b33'; ctx.font='800 20px Georgia, serif'; ctx.textAlign='center'; ctx.fillText(title, cx, 28);
    const scaleNote = subtitle ? `${subtitle} · display range 50-100` : 'display range 50-100';
    ctx.fillStyle='#6b7280'; ctx.font='700 12px Inter, Arial'; ctx.fillText(scaleNote, cx, 48);
    ctx.restore();
  }

  function drawPoly(ctx, cx, cy, r, n, start) {
    ctx.beginPath();
    for (let i=0;i<n;i++){ const a=start+i*2*Math.PI/n; const x=cx+Math.cos(a)*r, y=cy+Math.sin(a)*r; i?ctx.lineTo(x,y):ctx.moveTo(x,y); }
    ctx.closePath(); ctx.stroke();
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const words = text.split(' '); let line='', lines=[];
    words.forEach(word=>{ const test=line?line+' '+word:word; if(ctx.measureText(test).width>maxWidth && line){lines.push(line); line=word;} else line=test; });
    lines.push(line); const startY = y - (lines.length-1)*lineHeight/2; lines.forEach((l,i)=>ctx.fillText(l,x,startY+i*lineHeight));
  }

  function archetypeFor(a,b) {
    const pair = [a,b].sort().join('+');
    const table = {
      'justice+truthfulness': { title:'The Principled Judge', text:'You tend to prefer clear facts and fair treatment, even when this creates discomfort or delay.' },
      'courage+truthfulness': { title:'The Truth-Seeker', text:'You tend to favor direct disclosure and moral action, even when the situation is socially costly.' },
      'temperance+wisdom': { title:'The Prudent Guardian', text:'You tend to prefer measured, context-sensitive responses that avoid extremes.' },
      'justice+wisdom': { title:'The Wise Steward', text:'You tend to balance fairness with practical judgment and workable solutions.' },
      'courage+justice': { title:'The Bold Reformer', text:'You tend to act decisively when fairness is at stake, even if disruption follows.' },
      'temperance+truthfulness': { title:'The Careful Clarifier', text:'You tend to value truth, but prefer it communicated with restraint and proportion.' },
      'courage+wisdom': { title:'The Strategic Actor', text:'You tend to act under uncertainty, but prefer action guided by timing and judgment.' },
      'justice+temperance': { title:'The Balanced Arbiter', text:'You tend to seek fairness while avoiding overreaction or unnecessary escalation.' },
      'courage+temperance': { title:'The Disciplined Advocate', text:'You tend to value action, but want it controlled by moderation and self-command.' },
      'truthfulness+wisdom': { title:'The Wise Truth-Teller', text:'You tend to favor honesty, but not as a blunt instrument; timing and context matter.' }
    };
    return table[pair] || { title:'The Balanced Phronimos', text:'Your profile distributes emphasis across virtues rather than concentrating on a single style.' };
  }

  function centeredCosinePercent(userScores, modelScores) {
    const vals = virtues.map(v => userScores[v.id]).filter(v => v != null);
    if (!vals.length) return 0;
    const u = virtues.map(v => userScores[v.id] == null ? mean(vals) : userScores[v.id]);
    const m = virtues.map(v => modelScores[v.id]);
    const uc = center(u), mc = center(m);
    const dot = uc.reduce((s,x,i)=>s+x*mc[i],0);
    const nu = Math.sqrt(uc.reduce((s,x)=>s+x*x,0));
    const nm = Math.sqrt(mc.reduce((s,x)=>s+x*x,0));
    const cos = (!nu || !nm) ? 0 : dot/(nu*nm);
    return Math.round(100 * ((cos + 1)/2));
  }

  function confidenceLabel(n){ if(n>=6) return 'High'; if(n>=3) return 'Medium'; if(n>=1) return 'Low'; return 'None'; }
  function countStatus(s){ return dilemmas.filter(d => state.status[d.id] === s).length; }
  function mean(a){ return a.reduce((s,x)=>s+x,0)/a.length; }
  function center(a){ const m=mean(a); return a.map(x=>x-m); }
  function clamp(x,a,b){ return Math.max(a, Math.min(b, x)); }
  function byId(id){ return document.getElementById(id); }
  function escapeHtml(s){ return String(s).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
})();
