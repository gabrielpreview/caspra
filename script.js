/* ══════════════════════════════════════════════════════════════
   Caspra Labs — nébula volumétrica em 3D (perspectiva real)
   --------------------------------------------------------------
   Tudo vive num volume com eixo Z. A câmera flutua devagar para
   dentro do espaço: estrelas e gás recuam em perspectiva, crescem
   ao se aproximar e passam pela câmera. Sem bibliotecas — projeção
   3D→2D em canvas puro.

   Camadas:  backdrop de gás (fundo, tênue)
           → nuvens 3D (billboards de gás que você atravessa)
           → estrelas 3D (campo em perspectiva, com parallax)
   ══════════════════════════════════════════════════════════════ */
(function () {
  const canvas = document.getElementById('starfield');
  const ctx = canvas.getContext('2d');
  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W, H, FOCAL, Z_NEAR, Z_FAR, SPEED;
  let stars = [], clouds = [], backdrop = null;
  let mouseX = 0, mouseY = 0, panX = 0, panY = 0, t = 0;

  /* Produtos: posição normalizada (casa com o CSS) + cor */
  const PLANETS = [
    { x: 0.58, y: 0.22, rgb: [93, 202, 165] },  // aurelia · verde
    { x: 0.22, y: 0.55, rgb: [200, 137, 74] },  // latamtax · âmbar
    { x: 0.72, y: 0.65, rgb: [123, 175, 212] }, // hc360 · azul
  ];

  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ── Ruído de valor + fBm (para o gás) ───────────────────────── */
  function makeNoise() {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0, tm = p[i]; p[i] = p[j]; p[j] = tm; }
    const perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    const fade = t => t * t * t * (t * (t * 6 - 15) + 10), lerp = (a, b, t) => a + t * (b - a);
    return function (x, y) {
      const xi = Math.floor(x) & 255, yi = Math.floor(y) & 255, xf = x - Math.floor(x), yf = y - Math.floor(y);
      const u = fade(xf), v = fade(yf);
      const aa = perm[(perm[xi] + yi) & 255] / 255, ba = perm[(perm[(xi + 1) & 255] + yi) & 255] / 255;
      const ab = perm[(perm[xi] + ((yi + 1) & 255)) & 255] / 255, bb = perm[(perm[(xi + 1) & 255] + ((yi + 1) & 255)) & 255] / 255;
      return lerp(lerp(aa, ba, u), lerp(ab, bb, u), v);
    };
  }
  function fbm(n, x, y, oct) {
    let a = 0.5, f = 1, s = 0, nm = 0;
    for (let i = 0; i < oct; i++) { s += a * n(x * f, y * f); nm += a; a *= 0.5; f *= 2; }
    return s / nm;
  }

  /* ── Textura de nuvem de gás (alpha por fBm, colorida) ───────── */
  function makeCloudTexture(rgb, seedNoise) {
    const S = 256, off = document.createElement('canvas');
    off.width = off.height = S;
    const o = off.getContext('2d'), img = o.createImageData(S, S), d = img.data;
    const [cr, cg, cb] = rgb;
    for (let y = 0; y < S; y++) {
      const ny = y / S - 0.5;
      for (let x = 0; x < S; x++) {
        const nx = x / S - 0.5;
        const q = fbm(seedNoise, (nx + 0.5) * 3 + 5, (ny + 0.5) * 3 + 9, 4);
        let dens = fbm(seedNoise, (nx + 0.5) * 5 + q * 3, (ny + 0.5) * 5 + q * 3, 5);
        dens = smooth(0.35, 0.95, dens);
        const fall = clamp(1 - (nx * nx + ny * ny) * 4, 0, 1); // queda radial suave
        const a = Math.pow(dens * fall, 1.3);
        const core = Math.pow(fall, 2) * 0.4;
        const idx = (y * S + x) * 4;
        d[idx] = Math.min(255, cr + core * 90);
        d[idx + 1] = Math.min(255, cg + core * 90);
        d[idx + 2] = Math.min(255, cb + core * 90);
        d[idx + 3] = a * 255;
      }
    }
    o.putImageData(img, 0, 0);
    return off;
  }

  /* ── Backdrop: campo de gás plano e tênue, ao fundo de tudo ──── */
  function makeBackdrop(w, h) {
    const n = makeNoise(), off = document.createElement('canvas');
    off.width = w; off.height = h;
    const o = off.getContext('2d'), img = o.createImageData(w, h), d = img.data, asp = w / h;
    for (let y = 0; y < h; y++) {
      const ny = y / h;
      for (let x = 0; x < w; x++) {
        const nx = x / w;
        const q = fbm(n, nx * 2 + 3, ny * 2 + 1, 4);
        let dens = fbm(n, nx * 3 + q * 2, ny * 3 + q * 2, 5);
        dens = smooth(0.4, 0.95, dens);
        let wr = 0, wg = 0, wb = 0, ws = 0;
        for (const pl of PLANETS) {
          const dx = (nx - pl.x) * asp, dy = ny - pl.y, wt = 1 / ((dx * dx + dy * dy) * 7 + 0.05);
          wr += pl.rgb[0] * wt; wg += pl.rgb[1] * wt; wb += pl.rgb[2] * wt; ws += wt;
        }
        wr /= ws; wg /= ws; wb /= ws;
        const em = Math.pow(dens, 1.4) * 0.3;
        const idx = (y * w + x) * 4;
        d[idx] = wr * em; d[idx + 1] = wg * em; d[idx + 2] = wb * em;
        d[idx + 3] = Math.min(150, Math.pow(dens, 1.3) * 150);
      }
    }
    o.putImageData(img, 0, 0);
    return off;
  }

  /* ── Construção do universo ──────────────────────────────────── */
  let cloudTextures = [];

  function buildTextures() {
    const seeds = [makeNoise(), makeNoise(), makeNoise()];
    cloudTextures = [];
    PLANETS.forEach((pl, i) => {
      cloudTextures.push({ tex: makeCloudTexture(pl.rgb, seeds[i % 3]), rgb: pl.rgb, planet: i });
      cloudTextures.push({ tex: makeCloudTexture(pl.rgb, seeds[(i + 1) % 3]), rgb: pl.rgb, planet: i });
    });
    // poeira neutra
    cloudTextures.push({ tex: makeCloudTexture([140, 138, 130], seeds[0]), rgb: [140, 138, 130], planet: -1 });
    cloudTextures.push({ tex: makeCloudTexture([140, 138, 130], seeds[1]), rgb: [140, 138, 130], planet: -1 });
  }

  function spawnCloud(cloud, atFar) {
    const pick = cloudTextures[(Math.random() * cloudTextures.length) | 0];
    cloud.tex = pick.tex;
    cloud.z = atFar ? rand(Z_FAR * 0.7, Z_FAR) : rand(Z_NEAR, Z_FAR);
    cloud.baseSize = rand(0.35, 0.85) * FOCAL;
    cloud.alpha = rand(0.07, 0.16);
    cloud.spin = rand(0, Math.PI * 2);
    cloud.spinV = rand(-0.0002, 0.0002);
    // ancora a cor perto do planeta correspondente (quando houver)
    let tx, ty;
    if (pick.planet >= 0) {
      const pl = PLANETS[pick.planet];
      tx = pl.x * W + rand(-W * 0.18, W * 0.18);
      ty = pl.y * H + rand(-H * 0.18, H * 0.18);
    } else {
      tx = rand(0, W); ty = rand(0, H);
    }
    cloud.x = (tx - W / 2) * cloud.z / FOCAL;
    cloud.y = (ty - H / 2) * cloud.z / FOCAL;
  }

  function spawnStar(s, atFar) {
    s.z = atFar ? rand(Z_FAR * 0.85, Z_FAR) : rand(Z_NEAR, Z_FAR);
    const sx = rand(-W * 0.15, W * 1.15), sy = rand(-H * 0.15, H * 1.15);
    s.x = (sx - W / 2) * s.z / FOCAL;
    s.y = (sy - H / 2) * s.z / FOCAL;
    const roll = Math.random();
    s.bright = roll > 0.97;
    s.mid = !s.bright && roll > 0.84;
    s.baseR = s.bright ? rand(1.6, 2.4) : s.mid ? rand(0.9, 1.3) : rand(0.4, 0.8);
    s.op = s.bright ? rand(0.7, 1) : s.mid ? rand(0.4, 0.65) : rand(0.18, 0.42);
    s.phase = rand(0, Math.PI * 2);
    s.tw = rand(0.003, 0.01);
    s.tint = Math.random() > 0.82;
  }

  function build() {
    FOCAL = W;
    Z_NEAR = FOCAL * 0.14;
    Z_FAR = FOCAL * 2.4;
    SPEED = FOCAL * 0.00075; // avanço lento da câmera

    backdrop = makeBackdrop(Math.min(420, Math.round(W * 0.45)), Math.round(Math.min(420, Math.round(W * 0.45)) * H / W));

    clouds = [];
    for (let i = 0; i < 18; i++) { const c = {}; spawnCloud(c, false); clouds.push(c); }

    stars = [];
    const count = Math.min(1500, Math.floor(W * H / 1400));
    for (let i = 0; i < count; i++) { const s = {}; spawnStar(s, false); stars.push(s); }
  }

  function resize() {
    W = window.innerWidth; H = window.innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    build();
  }

  /* ── Frame ───────────────────────────────────────────────────── */
  function draw() {
    t += 1;
    ctx.clearRect(0, 0, W, H);

    // câmera: parallax suave do mouse + leve respiração automática
    const tgX = (mouseX - W / 2) * -0.05 + Math.sin(t * 0.0007) * W * 0.012;
    const tgY = (mouseY - H / 2) * -0.05 + Math.cos(t * 0.0005) * H * 0.012;
    panX += (tgX - panX) * 0.04;
    panY += (tgY - panY) * 0.04;
    const cx = W / 2, cy = H / 2;

    // 1 · Backdrop tênue (com leve parallax)
    if (backdrop) {
      ctx.globalAlpha = 0.85;
      const bw = W * 1.15, bh = H * 1.15;
      ctx.drawImage(backdrop, cx - bw / 2 + panX * 0.3, cy - bh / 2 + panY * 0.3, bw, bh);
      ctx.globalAlpha = 1;
    }

    // 2 · Nuvens 3D (ordenadas do fundo p/ frente, compositadas com 'lighter')
    const moving = !reduce;
    if (moving) for (const c of clouds) { c.z -= SPEED; c.spin += c.spinV; if (c.z <= Z_NEAR) spawnCloud(c, true); }
    clouds.sort((a, b) => b.z - a.z);
    ctx.globalCompositeOperation = 'lighter';
    for (const c of clouds) {
      const scale = FOCAL / c.z;
      const sx = cx + c.x * scale + panX * scale * 0.4;
      const sy = cy + c.y * scale + panY * scale * 0.4;
      const size = c.baseSize * scale;
      if (size < 8) continue;
      // alpha: surge ao longe, suaviza quando enorme (atravessando o gás)
      const fadeIn = smooth(Z_FAR, Z_FAR * 0.75, c.z);
      const fadeNear = smooth(W * 2.2, W * 1.1, size);
      ctx.globalAlpha = c.alpha * fadeIn * fadeNear;
      if (ctx.globalAlpha < 0.004) continue;
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(c.spin);
      ctx.drawImage(c.tex, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // 3 · Estrelas 3D
    if (moving) for (const s of stars) { s.z -= SPEED; if (s.z <= Z_NEAR) spawnStar(s, true); }
    for (const s of stars) {
      s.phase += s.tw;
      const scale = FOCAL / s.z;
      const sx = cx + s.x * scale + panX * scale;
      const sy = cy + s.y * scale + panY * scale;
      if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue;
      const r = clamp(s.baseR * scale, 0.3, 2.6);
      const tw = 0.65 + 0.35 * Math.sin(s.phase);
      const depth = smooth(Z_FAR, Z_FAR * 0.6, s.z); // some no extremo do fundo
      const a = s.op * tw * depth;

      if (s.bright && r > 1) {
        const halo = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 5);
        halo.addColorStop(0, `rgba(241,239,232,${a * 0.4})`);
        halo.addColorStop(1, 'rgba(241,239,232,0)');
        ctx.fillStyle = halo;
        ctx.beginPath(); ctx.arc(sx, sy, r * 5, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(241,239,232,${a * 0.45})`;
        ctx.lineWidth = 0.6;
        ctx.beginPath();
        ctx.moveTo(sx - r * 4.5, sy); ctx.lineTo(sx + r * 4.5, sy);
        ctx.moveTo(sx, sy - r * 4.5); ctx.lineTo(sx, sy + r * 4.5);
        ctx.stroke();
        ctx.fillStyle = `rgba(241,239,232,${a})`;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      } else if (s.mid || r > 0.9) {
        ctx.fillStyle = `rgba(241,239,232,${a})`;
        ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = s.tint ? `rgba(160,180,200,${a})` : `rgba(175,172,162,${a})`;
        ctx.fillRect(sx, sy, r * 1.5, r * 1.5);
      }
    }
    ctx.globalAlpha = 1;
  }

  function loop() { draw(); requestAnimationFrame(loop); }

  /* ── Interação ───────────────────────────────────────────────── */
  window.addEventListener('mousemove', e => { mouseX = e.clientX; mouseY = e.clientY; });
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', e => {
      if (e.gamma !== null && e.beta !== null) {
        mouseX = W / 2 + (clamp(e.gamma, -45, 45) / 45) * (W / 2);
        mouseY = H / 2 + (clamp(e.beta, -45, 45) / 45) * (H / 2);
      }
    });
  }
  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(resize, 180); });

  buildTextures();
  resize();
  if (reduce) draw(); else loop();
})();


/* ── Navegação por clique nos produtos ───────────────────────────── */
(function () {
  document.querySelectorAll('.product[data-href]').forEach(el => {
    el.setAttribute('role', 'link');
    el.setAttribute('tabindex', '0');
    const go = () => { window.location.href = el.dataset.href; };
    el.addEventListener('click', go);
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); }
    });
  });
})();
