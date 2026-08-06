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
    maxParticles: 600,    // total particles on screen (denser)
    trailLength: 200,     // base history length (long sweeping tails)
    baseSpeed: 0.085,     // px per frame per km/h
    spawnRate: 6,         // particles spawned per frame (modulated by avg wind)
    sampleInterval: 3,    // resample wind every N frames for performance
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
      this._tick();
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
    const life = 100 + Math.random() * 160;

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

    const nearest = pts
      .map(p => ({ ...p, dist: approxDistKm(lat, lng, p.lat, p.lng) }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 3);

    if (nearest[0].dist > 35) {
      return windVector(this._fallback.dirFrom, this._fallback.speed);
    }

    let wx = 0, wy = 0, wt = 0;
    for (const p of nearest) {
      const w = 1 / Math.max(p.dist, 0.05);
      const v = windVector(p.dirFrom, p.speed);
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
      const dynamicLen = Math.min(trailBase + Math.floor((p.speed || 10) / 3), 400);
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

    for (const p of this._particles) {
      const hist = p.history;
      if (hist.length < 2) continue;

      const lifeRatio = Math.max(0, p.life / p.maxLife);
      const headSpeed = p.speed || 10;
      // 明显加粗：头部最粗、尾部略细
      const headWidth = Math.min(1.125, 0.45 + headSpeed / 56);
      const tailWidth = 0.35;

      for (let i = 1; i < hist.length; i++) {
        const t = i / (hist.length - 1); // 0 tail -> 1 head
        const x0 = hist[i - 1].x;
        const y0 = hist[i - 1].y;
        const x1 = hist[i].x;
        const y1 = hist[i].y;

        // 海军蓝描线：尾巴更淡、头部更实，整体更显眼
        const alpha = (0.22 + 0.78 * t) * lifeRatio;
        const width = tailWidth + t * (headWidth - tailWidth);

        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.strokeStyle = this._colorAt(t, alpha);
        ctx.lineWidth = width;
        ctx.stroke();
      }
    }
  },

  _colorAt(t, alphaBase) {
    // 海军蓝拖尾（头实尾淡），在浅色地图上清晰可见
    return `rgba(29,52,97,${alphaBase.toFixed(3)})`;
  }
});
