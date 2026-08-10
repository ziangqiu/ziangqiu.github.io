// Wind particle flow layer for Leaflet
// Apple Weather app style: dense blue meteor-tail streamlines driven by wind speed/direction.

function toRad(deg) {
  return deg * Math.PI / 180;
}

// Fast equirectangular distance (accurate enough for IDW weights on city scale)
function approxDistKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const latMid = toRad((lat1 + lat2) / 2);
  const x = dLng * Math.cos(latMid);
  return R * Math.hypot(x, dLat);
}

function windVector(dirFrom, speed) {
  // Meteorology: dirFrom = where wind comes FROM.
  // We move particles in the direction wind blows TO.
  const to = (dirFrom + 180) % 360;
  const rad = toRad(to);
  return {
    vx: speed * Math.sin(rad),
    vy: -speed * Math.cos(rad),
    speed
  };
}

export const WindParticleLayer = L.Layer.extend({
  options: {
    maxParticles: 900,    // total particles on screen
    trailLength: 180,     // history point count — longer streaks
    baseSpeed: 0.30,      // px per frame per km/h — faster, smoother flow
    sampleInterval: 3,    // resample wind every N frames for performance
    spawnRate: 6,         // new particles per render frame (adjusted for wind speed below)
    maxFps: 30,           // cap canvas work; wind remains smooth without monopolising the browser
    lineCap: 'round',
    lineJoin: 'round'
  },

  initialize(options) {
    L.setOptions(this, options);
    this._windPoints = [];
    this._fallback = { speed: 10, dirFrom: 270 };
    this._particles = [];
    this._frame = 0;
    this._running = false;
    this._visible = false;
    this._lastTickAt = 0;
  },

  onAdd(map) {
    this._map = map;
    const pane = this.getPane ? this.getPane() : map.getPane('overlayPane');
    this._canvas = L.DomUtil.create('canvas', 'wind-particle-canvas', pane);
    L.DomUtil.addClass(this._canvas, 'leaflet-zoom-hide');
    L.DomEvent.disableClickPropagation(this._canvas);

    this._ctx = this._canvas.getContext('2d', { alpha: true });
    this._resize();
    map.on('move resize zoom', this._resize, this);

    this._onVisibility = () => {
      if (document.hidden) this._stop();
      else if (this._visible) this._start();
    };
    document.addEventListener('visibilitychange', this._onVisibility);

    return this;
  },

  onRemove(map) {
    this._stop();
    map.off('move resize zoom', this._resize, this);
    document.removeEventListener('visibilitychange', this._onVisibility);
    L.DomUtil.remove(this._canvas);
  },

  setWind(points, fallback) {
    this._windPoints = points || [];
    this._fallback = fallback || this._fallback;
    this._particles = [];
    if (this._visible && this._width) {
      this._spawnBatch(this.options.maxParticles);
    }
  },

  setVisible(visible) {
    this._visible = visible;
    if (!this._canvas) return;
    this._canvas.style.display = visible ? 'block' : 'none';
    if (visible) {
      this._start();
      if (!this._particles.length && this._width) this._spawnBatch(this.options.maxParticles);
    } else {
      this._stop();
    }
  },

  _resize() {
    if (!this._map) return;
    const size = this._map.getSize();
    const topLeft = this._map.containerPointToLayerPoint([0, 0]);
    L.DomUtil.setPosition(this._canvas, topLeft);
    this._canvas.width = size.x;
    this._canvas.height = size.y;
    this._width = size.x;
    this._height = size.y;
    this._particles = [];
    if (this._visible) this._spawnBatch(this.options.maxParticles);
  },

  _start() {
    if (this._running) return;
    this._running = true;
    const loop = () => {
      if (!this._running) return;
      const now = performance.now();
      if (now - this._lastTickAt >= 1000 / this.options.maxFps) {
        this._lastTickAt = now;
        this._tick();
      }
      this._animId = requestAnimationFrame(loop);
    };
    this._animId = requestAnimationFrame(loop);
  },

  _stop() {
    this._running = false;
    if (this._animId) cancelAnimationFrame(this._animId);
  },

  _tick() {
    if (!this._ctx || !this._width || !this._visible) return;
    this._frame++;
    this._updateParticles();
    this._draw();
  },

  _spawnBatch(count) {
    if (!this._width) return;
    for (let i = 0; i < count; i++) this._spawnParticle();
  },

  _spawnParticle() {
    if (!this._width || this._particles.length >= this.options.maxParticles) return;
    const margin = 80;
    const x = Math.random() * (this._width + margin * 2) - margin;
    const y = Math.random() * (this._height + margin * 2) - margin;
    const latlng = this._map.containerPointToLatLng([x, y]);
    const w = this._windAt(latlng.lat, latlng.lng);
    const speedFactor = this.options.baseSpeed * (0.8 + Math.random() * 0.4);
    // 存活帧数与 trailLength 挂钩 → 让 trailLength 真正决定拖尾长度
    const life = Math.round(this.options.trailLength * (0.55 + Math.random() * 0.7));

    this._particles.push({
      x,
      y,
      life,
      maxLife: life,
      history: [{ x, y }],
      vx: w.vx * speedFactor,
      vy: w.vy * speedFactor,
      speed: w.speed
    });
  },

  _windAt(lat, lng) {
    const pts = this._windPoints;
    if (!pts.length) return windVector(this._fallback.dirFrom, this._fallback.speed);

    // This runs for many particles. Avoid allocating/sorting arrays on every sample.
    const nearest = [];
    for (const p of pts) {
      const candidate = { p, dist: approxDistKm(lat, lng, p.lat, p.lng) };
      let index = nearest.findIndex(item => candidate.dist < item.dist);
      if (index < 0) index = nearest.length;
      nearest.splice(index, 0, candidate);
      if (nearest.length > 3) nearest.pop();
    }

    if (nearest[0].dist > 35) {
      return windVector(this._fallback.dirFrom, this._fallback.speed);
    }

    let wx = 0, wy = 0, wt = 0;
    for (const item of nearest) {
      const w = 1 / Math.max(item.dist, 0.05);
      const v = windVector(item.p.dirFrom, item.p.speed);
      wx += v.vx * w;
      wy += v.vy * w;
      wt += w;
    }
    const vx = wx / wt;
    const vy = wy / wt;
    return { vx, vy, speed: Math.hypot(vx, vy) };
  },

  _updateParticles() {
    const desired = this._desiredSpawnCount();
    const room = this.options.maxParticles - this._particles.length;
    const spawnCount = Math.max(0, Math.min(desired, room));
    for (let i = 0; i < spawnCount; i++) this._spawnParticle();

    const trailBase = this.options.trailLength;
    const next = [];
    const margin = 60;

    for (const p of this._particles) {
      if (this._frame % this.options.sampleInterval === 0) {
        const latlng = this._map.containerPointToLatLng([p.x, p.y]);
        const w = this._windAt(latlng.lat, latlng.lng);
        const speedFactor = this.options.baseSpeed * (0.8 + Math.random() * 0.4);
        p.vx = w.vx * speedFactor;
        p.vy = w.vy * speedFactor;
        p.speed = w.speed;
      }

      p.x += p.vx;
      p.y += p.vy;
      p.life--;

      p.history.push({ x: p.x, y: p.y });
      // 风越大拖尾越长（明显加长）
      const dynamicLen = Math.min(trailBase + Math.floor((p.speed || 10) / 3), 1000);
      if (p.history.length > dynamicLen) p.history.shift();

      const out = p.x < -margin || p.x > this._width + margin ||
                  p.y < -margin || p.y > this._height + margin;
      if (!out && p.life > 0) next.push(p);
    }
    this._particles = next;
  },

  _desiredSpawnCount() {
    if (!this._windPoints.length) return this.options.spawnRate;
    const avg = this._windPoints.reduce((a, p) => a + p.speed, 0) / this._windPoints.length;
    // More particles (denser streamlines) when wind is stronger
    return Math.max(1, Math.round(this.options.spawnRate * (1 + avg / 28)));
  },

  _draw() {
    const ctx = this._ctx;
    ctx.clearRect(0, 0, this._width, this._height);
    ctx.lineCap = this.options.lineCap;
    ctx.lineJoin = this.options.lineJoin;

    // 性能关键：每条风线只做【一次】描边（用渐变实现头实尾淡），
    // 不再逐段描边、不再用 shadowBlur —— 之前卡顿就是这两点造成的。
    for (const p of this._particles) {
      const hist = p.history;
      const n = hist.length;
      if (n < 2) continue;

      const lifeRatio = Math.max(0.4, p.life / p.maxLife);
      const head = hist[n - 1];
      const tail = hist[0];
      const headSpeed = p.speed || 10;
      const lineWidth = Math.min(2.0, 0.9 + headSpeed / 40);

      // 沿「尾→头」的渐变：尾透明、头浓，营造流星拖尾（不逐段描边）
      const grad = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      grad.addColorStop(0, `rgba(29,52,97,${(0.35 * lifeRatio).toFixed(3)})`);
      grad.addColorStop(1, `rgba(29,52,97,${(0.85 * lifeRatio).toFixed(3)})`);

      ctx.strokeStyle = grad;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.moveTo(hist[0].x, hist[0].y);
      for (let i = 1; i < n; i++) ctx.lineTo(hist[i].x, hist[i].y);
      ctx.stroke();
    }
  },

  _colorAt(t, alphaBase) {
    // 海军蓝拖尾（头实尾淡），在浅色地图上清晰可见
    return `rgba(29,52,97,${alphaBase.toFixed(3)})`;
  }
});
