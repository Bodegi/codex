/**
 * Interactive World Atlas & Cartography Studio Component
 * Supports Pan/Zoom, Interactive Waypoints, Road/Rail Vector Networks, Territory Polygons, and Real-time Persistence.
 */

import { listImages, resolve as resolvePoolImage } from '../utils/imagePool.js';

function escapeAttr(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderAtlasView() {
  const images = listImages();
  const mapOptions = images.length
    ? images.map((img) => `<option value="${escapeAttr(img.id)}">${escapeAttr(img.label)}</option>`).join('')
    : '<option value="">No images in pool</option>';
  const defaultSrc = images.length ? images[0].url : '';

  return `
    <div class="form-section atlas-container">
      <div class="section-header">
        🗺️ World Atlas & Cartography Studio
      </div>

      <!-- Controls & Map Selector Toolbar -->
      <div class="atlas-toolbar">
        <div class="tool-group">
          <label style="font-size:11px; color:var(--text-muted); display:block;">Active Tool:</label>
          <button id="atlas-tool-select" class="btn btn-primary btn-sm" title="Select & Inspect Map Objects">🔍 Select</button>
          <button id="atlas-tool-waypoint" class="btn btn-secondary btn-sm" title="Drop Interactive Waypoint Pin">📍 Waypoint</button>
          <button id="atlas-tool-road" class="btn btn-secondary btn-sm" title="Draw Road / Rail Line">🛤️ Road & Rail</button>
          <button id="atlas-tool-territory" class="btn btn-secondary btn-sm" title="Draw Territory Polygon">🏰 Territory</button>
        </div>

        <div class="tool-group" style="margin-left:auto;">
          <label style="font-size:11px; color:var(--text-muted); display:block;">Map Image:</label>
          <select id="atlas-map-select" class="form-control" style="font-size:12px; padding:4px 8px;">
            ${mapOptions}
          </select>
        </div>

        <div class="tool-group">
          <label style="font-size:11px; color:var(--text-muted); display:block;">Zoom:</label>
          <button id="atlas-zoom-in" class="btn btn-secondary btn-sm">➕</button>
          <button id="atlas-zoom-out" class="btn btn-secondary btn-sm">➖</button>
          <button id="atlas-zoom-reset" class="btn btn-secondary btn-sm">🔄 Reset</button>
        </div>
      </div>

      <!-- Interactive Canvas Container -->
      <div class="atlas-map-wrapper" id="atlas-wrapper">
        <img id="atlas-bg-img" src="${defaultSrc}" class="atlas-map-img" alt="ATM10 World Map">
        <canvas id="atlas-canvas" class="atlas-canvas-overlay"></canvas>
      </div>

      <!-- Inspector Bar for Selected Vector Elements -->
      <div id="atlas-inspector-panel" class="form-section hidden" style="margin-top:12px; background:rgba(0,0,0,0.4);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
          <strong id="inspector-title" style="color:var(--accent-gold); font-size:13px;">Selected Object</strong>
          <button id="btn-delete-object" class="btn btn-secondary btn-sm" style="color:var(--accent-crimson);">🗑️ Delete Shape</button>
        </div>
        <div class="form-grid">
          <div class="form-group">
            <label>Name / Label</label>
            <input type="text" id="inspector-name" class="form-control" placeholder="Object Label">
          </div>
          <div class="form-group">
            <label>Associated Civilization</label>
            <select id="inspector-civ" class="form-control">
              <option value="dwarves">Dwarves — Masters of Industry</option>
              <option value="halflings">Halflings — Keepers of the Harvest</option>
              <option value="elves">Elves — Scholars of Magic</option>
              <option value="humans">Humans — Merchants & Administrators</option>
              <option value="orcs">Orcs — Transporters & Builders</option>
              <option value="gnomes">Gnomes — Inventors</option>
              <option value="necromancers">Necromancers / Vampires</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Initialize Interactive Canvas Controls (Pan, Zoom, Polygon Territory Drawing, Polyline Rails, Interactive Pins)
 */
export function initAtlasCanvas(firebaseManager) {
  const canvas = document.getElementById('atlas-canvas');
  const bgImg = document.getElementById('atlas-bg-img');
  const mapSelect = document.getElementById('atlas-map-select');
  if (!canvas || !bgImg) return;

  const ctx = canvas.getContext('2d');
  const wrapper = document.getElementById('atlas-wrapper');

  // Resize canvas to match wrapper container bounds
  canvas.width = wrapper.clientWidth;
  canvas.height = wrapper.clientHeight;

  // Viewport Transform State
  let scale = 1;
  let panX = 0;
  let panY = 0;
  let isPanning = false;
  let startX = 0;
  let startY = 0;

  // Vector Objects State
  let activeTool = 'select'; // 'select', 'waypoint', 'road', 'territory'
  let waypoints = [];
  let roads = [];
  let territories = [];
  let currentPoints = [];
  let selectedObject = null;

  // Colors mapping per civilization
  const civColors = {
    dwarves: '#f59e0b',
    halflings: '#10b981',
    elves: '#3b82f6',
    humans: '#8b5cf6',
    orcs: '#ef4444',
    gnomes: '#d97706',
    necromancers: '#6b7280'
  };

  // Map Image Selector — options carry pool ids; resolve to the current build URL
  if (mapSelect) {
    mapSelect.addEventListener('change', (e) => {
      const url = resolvePoolImage(e.target.value);
      if (url) bgImg.src = url;
      saveMapStateToFirebase();
    });
  }

  // Tool Buttons
  const tools = {
    select: document.getElementById('atlas-tool-select'),
    waypoint: document.getElementById('atlas-tool-waypoint'),
    road: document.getElementById('atlas-tool-road'),
    territory: document.getElementById('atlas-tool-territory')
  };

  Object.keys(tools).forEach(t => {
    if (tools[t]) {
      tools[t].addEventListener('click', () => {
        activeTool = t;
        Object.values(tools).forEach(b => {
          b.classList.remove('btn-primary');
          b.classList.add('btn-secondary');
        });
        tools[t].classList.remove('btn-secondary');
        tools[t].classList.add('btn-primary');

        if (activeTool !== 'road' && activeTool !== 'territory' && currentPoints.length > 0) {
          commitCurrentShape();
        }
      });
    }
  });

  // Zoom Controls
  document.getElementById('atlas-zoom-in')?.addEventListener('click', () => zoom(1.2));
  document.getElementById('atlas-zoom-out')?.addEventListener('click', () => zoom(0.8));
  document.getElementById('atlas-zoom-reset')?.addEventListener('click', () => {
    scale = 1;
    panX = 0;
    panY = 0;
    redraw();
  });

  function zoom(factor) {
    scale *= factor;
    scale = Math.min(Math.max(0.5, scale), 4);
    redraw();
  }

  // Listen to mouse wheel for smooth zoom
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    zoom(zoomFactor);
  });

  // Canvas Mouse Down Handler
  canvas.addEventListener('mousedown', (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - panX) / scale;
    const y = (e.clientY - rect.top - panY) / scale;

    if (e.button === 1 || e.shiftKey) {
      // Middle click or Shift-click to Pan
      isPanning = true;
      startX = e.clientX - panX;
      startY = e.clientY - panY;
      return;
    }

    if (activeTool === 'waypoint') {
      const name = prompt('Enter Waypoint Label:', 'New Outpost');
      if (name) {
        waypoints.push({ id: Date.now(), name, x, y, civ: 'dwarves' });
        saveMapStateToFirebase();
        redraw();
      }
    } else if (activeTool === 'road' || activeTool === 'territory') {
      currentPoints.push({ x, y });
      redraw();
    } else if (activeTool === 'select') {
      // Check collision with waypoints
      const hit = waypoints.find(w => Math.hypot(w.x - x, w.y - y) < 12);
      if (hit) {
        selectedObject = { type: 'waypoint', data: hit };
        openInspector(hit.name, hit.civ);
      } else {
        document.getElementById('atlas-inspector-panel')?.classList.add('hidden');
      }
    }
  });

  // Double click finishes a polygon or path
  canvas.addEventListener('dblclick', () => {
    if (currentPoints.length > 1) {
      commitCurrentShape();
    }
  });

  function commitCurrentShape() {
    if (currentPoints.length < 2) return;

    if (activeTool === 'road') {
      roads.push({ id: Date.now(), name: 'Trade Route', points: [...currentPoints], civ: 'orcs' });
    } else if (activeTool === 'territory') {
      territories.push({ id: Date.now(), name: 'Territory Domain', points: [...currentPoints], civ: 'dwarves' });
    }

    currentPoints = [];
    saveMapStateToFirebase();
    redraw();
  }

  // Canvas Mouse Move Handler
  canvas.addEventListener('mousemove', (e) => {
    if (isPanning) {
      panX = e.clientX - startX;
      panY = e.clientY - startY;
      redraw();
    }
  });

  canvas.addEventListener('mouseup', () => {
    isPanning = false;
  });

  // Save State to Firebase if configured
  function saveMapStateToFirebase() {
    if (firebaseManager && firebaseManager.isConfigured()) {
      firebaseManager.saveMapData({ waypoints, roads, territories, mapImageId: mapSelect?.value || '' });
    }
  }

  // Subscribe to Realtime Map Updates
  if (firebaseManager && firebaseManager.isConfigured()) {
    firebaseManager.subscribeToMapData((data) => {
      if (data) {
        waypoints = data.waypoints || [];
        roads = data.roads || [];
        territories = data.territories || [];
        if (data.mapImageId && mapSelect) {
          mapSelect.value = data.mapImageId;
          const url = resolvePoolImage(data.mapImageId);
          if (url) bgImg.src = url;
        }
        redraw();
      }
    });
  }

  // Redraw All Vector Elements
  function redraw() {
    ctx.save();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.translate(panX, panY);
    ctx.scale(scale, scale);

    // 1. Draw Territory Polygons
    territories.forEach(ter => {
      if (ter.points.length < 3) return;
      ctx.beginPath();
      ctx.moveTo(ter.points[0].x, ter.points[0].y);
      for (let i = 1; i < ter.points.length; i++) {
        ctx.lineTo(ter.points[i].x, ter.points[i].y);
      }
      ctx.closePath();
      const color = civColors[ter.civ] || '#f59e0b';
      ctx.fillStyle = hexToRgba(color, 0.25);
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();
    });

    // 2. Draw Road & Rail Polylines
    roads.forEach(rd => {
      if (rd.points.length < 2) return;
      ctx.beginPath();
      ctx.moveTo(rd.points[0].x, rd.points[0].y);
      for (let i = 1; i < rd.points.length; i++) {
        ctx.lineTo(rd.points[i].x, rd.points[i].y);
      }
      ctx.strokeStyle = civColors[rd.civ] || '#3b82f6';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    });

    // 3. Draw Active In-Progress Path
    if (currentPoints.length > 0) {
      ctx.beginPath();
      ctx.moveTo(currentPoints[0].x, currentPoints[0].y);
      for (let i = 1; i < currentPoints.length; i++) {
        ctx.lineTo(currentPoints[i].x, currentPoints[i].y);
      }
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 4. Draw Waypoint Pins
    waypoints.forEach(wp => {
      const color = civColors[wp.civ] || '#f59e0b';
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(wp.x, wp.y, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Inter';
      ctx.fillText(wp.name, wp.x + 10, wp.y + 4);
    });

    ctx.restore();
  }

  function openInspector(name, civ) {
    const panel = document.getElementById('atlas-inspector-panel');
    if (!panel) return;
    panel.classList.remove('hidden');
    document.getElementById('inspector-name').value = name;
    document.getElementById('inspector-civ').value = civ || 'dwarves';
  }

  // Delete Selected Object
  document.getElementById('btn-delete-object')?.addEventListener('click', () => {
    if (!selectedObject) return;
    if (selectedObject.type === 'waypoint') {
      waypoints = waypoints.filter(w => w.id !== selectedObject.data.id);
    }
    selectedObject = null;
    document.getElementById('atlas-inspector-panel')?.classList.add('hidden');
    saveMapStateToFirebase();
    redraw();
  });

  redraw();
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
