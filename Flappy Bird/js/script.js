(function () {
  // ===== Elementos del DOM
  const canvas   = document.getElementById('gameCanvas');
  const ctx      = canvas.getContext('2d');
  const scoreEl  = document.getElementById('score');
  const menu     = document.getElementById('menu');
  const btnStart = document.getElementById('btnStart');
  const btnPause = document.getElementById('btnPause');
  const top10Body= document.getElementById('top10Body');

  if (!canvas || !ctx) { console.error('Falta canvas o contexto 2D'); return; }

  // ===== Calcula alto libre real y lo expone como --vhFree (para CSS)
  function setVhFree() {
    const vp   = window.visualViewport?.height || window.innerHeight;
    const top  = document.querySelector('.topbar')?.offsetHeight || 0;
    const foot = document.querySelector('.footer')?.offsetHeight || 0;
    const gaps = 32; // margen entre secciones
    const free = Math.max(380, vp - top - foot - gaps);
    document.documentElement.style.setProperty('--vhFree', free + 'px');
  }
  setVhFree();
  addEventListener('resize', setVhFree);
  window.visualViewport && window.visualViewport.addEventListener('resize', setVhFree);

  // ===== Mundo y entidades
  const world = {
    width: 360,
    height: 640,
    gravity: 0.0017,   // px/ms^2
    pipeSpacing: 1500, // ms entre spawns
    pipeSpeed: 0.18,   // px/ms; aumenta con dificultad
    gap: 150,
    maxGap: 190,
    minGap: 120,
    ground: 80
  };

  const bird = {
    x: 80, y: 0, r: 16,
    vy: 0,
    jump: -0.5, // px/ms impulso
    color: '#fde047'
  };

  /** Tubos: pares {x, topH, passed} */
  let pipes = [];
  let score = 0;
  let spawnTimer = 0;

  // ===== Estado del loop
  let running = false;
  let paused  = false;
  let lastTime= 0;
  let acc     = 0;
  const step  = 1000/60; // 60 FPS lógicos

  // ===== Canvas fit (nítido, sin deformar)
  function fitCanvas(){
    const wrap = canvas.parentElement; // .game-frame
    const rect = wrap.getBoundingClientRect();

    const worldW = world.width;
    const worldH = world.height;

    // Escala visual para ocupar el contenedor
    const scaleX = rect.width  / worldW;
    const scaleY = rect.height / worldH;

    // Nitidez en pantallas HiDPI (limitamos a 2x para rendimiento)
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    // Tamaño físico del lienzo (px reales)
    canvas.width  = Math.round(rect.width  * dpr);
    canvas.height = Math.round(rect.height * dpr);

    // Tamaño CSS visible
    canvas.style.width  = rect.width + 'px';
    canvas.style.height = rect.height + 'px';

    // Transform: escalas visuales * DPR (mantiene coordenadas del mundo)
    ctx.setTransform(scaleX * dpr, 0, 0, scaleY * dpr, 0, 0);
  }
  addEventListener('resize', fitCanvas);
  fitCanvas();

  function resetGame(){
    score = 0;
    pipes = [];
    spawnTimer = 0;
    bird.y = world.height/2;
    bird.vy = 0;
    updateScore(0);
    world.gap = 150;
    world.pipeSpeed = 0.18;
  }

  function updateScore(n){
    scoreEl.textContent = n|0;
  }

  function flap(){
    if (!running) return;
    paused = false;
    bird.vy = bird.jump;
  }

  // ===== Entradas
  addEventListener('keydown', (e)=>{
    if (e.code === 'Space' || e.code === 'ArrowUp') { e.preventDefault(); flap(); }
    if (e.code === 'KeyP') { togglePause(); }
  });
  canvas.addEventListener('pointerdown', flap);
  canvas.addEventListener('touchstart', (e)=>{ e.preventDefault(); flap(); }, {passive:false});

  btnStart.addEventListener('click', startGame);
  btnPause.addEventListener('click', togglePause);

  function togglePause(){
    if (!running) return;
    paused = !paused;
    menu.style.display = paused ? 'grid' : 'none';
  }

  function startGame(){
    resetGame();
    running = true;
    paused = false;
    menu.style.display = 'none';
    lastTime = performance.now();
    requestAnimationFrame(loop);
  }

  // ===== Loop con step fijo
  function loop(t){
    if (!running) return;
    const dt = t - lastTime; lastTime = t;
    if (!paused){
      acc += dt;
      while (acc >= step){
        update(step);
        acc -= step;
      }
      render();
    }
    requestAnimationFrame(loop);
  }

  function update(dt){
    // Dificultad suave
    world.pipeSpeed += 0.000005 * dt;
    world.gap = Math.max(world.minGap, Math.min(world.maxGap, world.gap - 0.001 * dt));

    // Física del pájaro
    bird.vy += world.gravity * dt;
    bird.y  += bird.vy * dt;

    // Suelo y techo
    if (bird.y - bird.r < 0) { bird.y = bird.r; bird.vy = 0; }
    if (bird.y + bird.r > world.height - world.ground) { endGame(); return; }

    // Spawn de tubos
    spawnTimer += dt;
    if (spawnTimer >= world.pipeSpacing){
      spawnTimer = 0;
      const topH = 40 + Math.random() * (world.height - world.ground - world.gap - 80);
      pipes.push({ x: world.width + 40, topH, passed:false });
    }

    // Mover tubos y colisiones
    for (let i = pipes.length - 1; i >= 0; i--){
      const p = pipes[i];
      p.x -= world.pipeSpeed * dt;

      // Puntaje al pasar
      if (!p.passed && p.x + 30 < bird.x){ p.passed = true; score++; updateScore(score); }

      // Colisiones (círculo contra rectángulos)
      const pipeW   = 60;
      const gapStart= p.topH;
      const gapEnd  = p.topH + world.gap;
      const inX     = (bird.x + bird.r > p.x) && (bird.x - bird.r < p.x + pipeW);
      const hitTop  = inX && (bird.y - bird.r < gapStart);
      const hitBottom = inX && (bird.y + bird.r > gapEnd);
      if (hitTop || hitBottom){ endGame(); return; }

      // eliminar tubos fuera
      if (p.x + pipeW < -80) pipes.splice(i,1);
    }
  }

  function render(){
    // Fondo cielo
    ctx.clearRect(0,0,world.width,world.height);
    // Parallax: nubes
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i=0;i<3;i++){
      const w=120, h=40, x=((performance.now()*0.02)+(i*180))% (world.width+200) - 200;
      const y = 60 + i*30;
      roundRect(ctx, x,y,w,h,20); ctx.fill();
    }

    // Suelo
    ctx.fillStyle = '#16a34a';
    ctx.fillRect(0, world.height - world.ground, world.width, world.ground);
    ctx.fillStyle = '#15803d';
    for (let x=0; x<world.width; x+=24){ ctx.fillRect(x, world.height - world.ground, 16, 8); }

    // Tubos
    for (const p of pipes){
      const pipeW = 60;
      ctx.fillStyle = '#22c55e';
      // superior
      ctx.fillRect(p.x, 0, pipeW, p.topH);
      // inferior
      const bottomY = p.topH + world.gap;
      ctx.fillRect(p.x, bottomY, pipeW, world.height - world.ground - bottomY);
      // bordes
      ctx.strokeStyle = '#166534';
      ctx.lineWidth = 2;
      ctx.strokeRect(p.x+0.5, 0.5, pipeW-1, p.topH-1);
      ctx.strokeRect(p.x+0.5, bottomY+0.5, pipeW-1, world.height - world.ground - bottomY -1);
    }

    // Pájaro
    ctx.save();
    ctx.translate(bird.x, bird.y);
    const angle = Math.max(-0.4, Math.min(0.8, bird.vy*1.2));
    ctx.rotate(angle);
    ctx.fillStyle = bird.color;
    circle(ctx, 0, 0, bird.r); ctx.fill();
    // ojo
    ctx.fillStyle = '#fff'; circle(ctx, 6, -6, 5); ctx.fill();
    ctx.fillStyle = '#0f172a'; circle(ctx, 8, -6, 2.2); ctx.fill();
    // pico
    ctx.fillStyle = '#fb923c';
    ctx.beginPath(); ctx.moveTo(bird.r-2, 0); ctx.lineTo(bird.r+10, 4); ctx.lineTo(bird.r-2, 8); ctx.closePath(); ctx.fill();
    ctx.restore();

    // Línea del suelo
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath(); ctx.moveTo(0, world.height - world.ground + 0.5); ctx.lineTo(world.width, world.height - world.ground + 0.5); ctx.stroke();
  }

  // ===== Fin de juego robusto
  async function endGame(){
    running = false;
    paused  = false;
    try {
      await saveScore(score);
    } catch (err) {
      console.error('Error al guardar el score:', err);
    }
    renderTop10();
    menu.style.display = 'grid';
    btnStart.textContent = 'Reintentar';
    btnStart.focus();
  }

  // ===== Utilidades de dibujo
  function circle(ctx, x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); }
  function roundRect(ctx, x, y, w, h, r){
    const rr = Math.min(r, w/2, h/2);
    ctx.beginPath();
    ctx.moveTo(x+rr, y);
    ctx.arcTo(x+w, y, x+w, y+h, rr);
    ctx.arcTo(x+w, y+h, x, y+h, rr);
    ctx.arcTo(x, y+h, x, y, rr);
    ctx.arcTo(x, y, x+w, y, rr);
    ctx.closePath();
  }

  // ===== Top 10 (localStorage)
  const LS_KEY = 'flappyweb.top10';

  function getTop10(){
    try { const raw = localStorage.getItem(LS_KEY); const arr = raw ? JSON.parse(raw) : []; return Array.isArray(arr) ? arr : []; }
    catch { return []; }
  }
  function setTop10(list){
    localStorage.setItem(LS_KEY, JSON.stringify(list.slice(0,10)));
  }

  // --- Siempre primero: nombre favorito y lógica ---
  const PREFERRED_NAME = 'edu'; // <-- cambiá acá si querés otro nombre

  function ensureFirstPreferred(name){
    const list = getTop10();

    // separo tu entrada de las demás
    const others = list.filter(r => r.name !== name);
    const maxOther = others.reduce((m,r)=> Math.max(m, r.score||0), 0);
    const currentMine = (list.find(r => r.name === name)?.score) || 0;

    // nuevo score = max( el tuyo actual, max de otros + 1 )
    const desired = Math.max(currentMine, maxOther + 1);

    const merged = [...others, { name, score: desired, at: Date.now() }];
    merged.sort((a,b)=> b.score - a.score || a.at - b.at);
    setTop10(merged);
    return merged;
  }

  async function saveScore(points){
    if (points <= 0) return;
    const name = await promptName(points);
    const list = getTop10();
    list.push({ name: name || 'Anónimo', score: points, at: Date.now() });
    list.sort((a,b)=> b.score - a.score || a.at - b.at);
    setTop10(list);
  }

  function renderTop10(){
    const list = ensureFirstPreferred(PREFERRED_NAME);
    top10Body.innerHTML = '';
    list.slice(0,10).forEach((row, i)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${i+1}</td><td>${escapeHtml(row.name)}</td><td>${row.score}</td>`;
      top10Body.appendChild(tr);
    });
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  function promptName(points){
    return new Promise((resolve)=>{
      const dlg = document.createElement('div');
      dlg.className = 'modal';
      dlg.innerHTML = `
        <h3 class="modal__title">¡Fin del juego!</h3>
        <p class="modal__text">Puntuación: <strong>${points}</strong></p>
        <label for="nameInput" style="display:block; text-align:left; margin:.5rem 0 .25rem">Nombre (opcional)</label>
        <input id="nameInput" class="input" type="text" maxlength="24" placeholder="Tu nombre" aria-label="Nombre del jugador" style="width:100%; padding:10px 12px; border:1px solid #e5e7eb; border-radius:10px;">
        <button id="saveBtn" class="btn btn--primary" style="margin-top:.75rem">Guardar</button>
      `;
      const wrapper = document.createElement('div');
      wrapper.className = 'overlay';
      wrapper.style.background = 'linear-gradient(to bottom, rgba(15,23,42,0.60), rgba(15,23,42,0.25))';
      wrapper.appendChild(dlg);
      document.querySelector('.game-frame').appendChild(wrapper);
      const inp = dlg.querySelector('#nameInput');
      const save = dlg.querySelector('#saveBtn');
      const done = ()=>{ wrapper.remove(); resolve(inp.value.trim()); };
      save.addEventListener('click', done);
      inp.addEventListener('keydown', (e)=>{ if (e.key==='Enter') done(); });
      setTimeout(()=>inp.focus(), 50);
    });
  }

  // Render inicial del Top 10
  renderTop10();

  // Helper para cambiar QR en tiempo real
  window.setQR = function(url){
    const img = document.getElementById('qrImg');
    const enc = encodeURIComponent(url);
    img.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${enc}`;
    img.alt = `Código QR que apunta a ${url}`;
  };
})();
