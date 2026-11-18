// Two articulated display meshes share the same pivot. A studio matcap keeps the
// reflections stable during the snip and avoids a lighting prepass on each mount.
const vendor = new URL('../public/vendor/shears-three.bundle.js', import.meta.url);
const still = new URL('../public/media/salon-shears.webp', import.meta.url);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
let studioCanvas;

function studio() {
  if (studioCanvas) return studioCanvas;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(size, size);
  const stripe = (d, width, feather) => clamp((width + feather - Math.abs(d)) / feather);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = (2 * x + 1) / size - 1;
      const ny = 1 - (2 * y + 1) / size;
      const nz = Math.sqrt(clamp(1 - nx * nx - ny * ny));
      const rx = 2 * nx * nz;
      const ry = 2 * ny * nz;
      const rz = 2 * nz * nz - 1;
      const a = Math.atan2(rx, rz);
      const e = Math.asin(clamp(ry, -1, 1));
      const key = stripe(e - .21 * Math.sin(a + .55) - .36, .19, .12);
      const edge = stripe(e + .31 + .25 * Math.cos(a - .4), .045, .06);
      const panel = stripe(a + 1.65, .47, .19) * stripe(e + .09, .34, .16);
      const rim = stripe(a - 1.65, .24, .18) * stripe(e, .85, .13);
      const front = stripe(e + .13*Math.sin(a + .4) + .1, .25, .30) * stripe(a + .1, 1.02, .48);
      const light = Math.max(key * .89, edge * .95, panel, rim * .82, front * .68);
      const ambient = .19 + .13 * nz + .08 * (ry + 1) + .055 * Math.cos(2.8 * a);
      const i = (y * size + x) * 4;
      const gray = clamp(ambient + light * .8);
      pixels.data[i] = clamp(gray * .96 + .05 * key) * 255;
      pixels.data[i + 1] = clamp(gray + .025 * panel) * 255;
      pixels.data[i + 2] = clamp(gray * 1.06 + .055 * (1 - key)) * 255;
      pixels.data[i + 3] = 255;
    }
  }
  ctx.putImageData(pixels, 0, 0);
  studioCanvas = canvas;
  return canvas;
}

function makeShears(T) {
  const group = new T.Group();
  const map = new T.CanvasTexture(studio());
  map.colorSpace = T.SRGBColorSpace;
  const surface = (color) => new T.MeshMatcapMaterial({color, matcap: map, side: T.DoubleSide});
  const steel = surface(0xf0f4ff);
  const polished = surface(0xffffff);
  const copper = surface(0xffb98a);
  const roseGold = surface(0xffc29b);
  const gunmetal = surface(0x4b526e);
  const mesh = (parent, geometry, material) => {
    const part = new T.Mesh(geometry, material);
    parent.add(part);
    return part;
  };
  function tube(parent, points, radius, material, closed = false) {
    const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p)), closed);
    const steps = closed ? 100 : 48;
    const sides = 16;
    const frames = curve.computeFrenetFrames(steps, closed);
    const position = [], normal = [], indices = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, center = curve.getPointAt(t), r = radius(t);
      for (let j = 0; j <= sides; j++) {
        const a = j * Math.PI * 2 / sides;
        const n = frames.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a));
        normal.push(n.x, n.y, n.z);
        position.push(center.x + n.x * r, center.y + n.y * r, center.z + n.z * r * .88);
        if (i < steps && j < sides) {
          const k = i * (sides + 1) + j;
          indices.push(k, k + 1, k + sides + 1, k + 1, k + sides + 2, k + sides + 1);
        }
      }
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(position, 3));
    geometry.setAttribute('normal', new T.Float32BufferAttribute(normal, 3));
    geometry.setIndex(indices);
    return mesh(parent, geometry, material);
  }
  function fingerRing(parent, cx, cy, sign, thumb) {
    const points = [], tilt = sign * (thumb ? .29 : .15);
    const rx = thumb ? .465 : .403;
    const ry = thumb ? .341 : .325;
    for (let i = 0; i < 24; i++) {
      const a = i * Math.PI / 12;
      const vx = rx * Math.cos(a), vy = ry * Math.sin(a);
      points.push([cx + vx * Math.cos(tilt) - vy * Math.sin(tilt), cy + vx * Math.sin(tilt) + vy * Math.cos(tilt), .028 * Math.cos(a - .6)]);
    }
    tube(parent, points, (t) => .069 + .012 * (1 + Math.cos(t * 2 * Math.PI - .6)), copper, true);
  }
  function blade(parent, sign) {
    const stations = [
      [-.07, .106, -.095, .09], [.19, .157, -.096, .103],
      [.42, .167, -.086, .093], [1, .147, -.076, .078],
      [1.75, .100, -.054, .052], [2.38, .055, -.027, .027], [2.85, .002, -.002, .006],
    ];
    // The separate grind faces catch light differently while following the taper.
    const bands = [.0, .48, .78, .96, 1], height = [.012, 1, .67, .13, 0];
    const position = [], materialIDs = [];
    const vertex = (station, j, underside) => {
      const [x, back, edge, thickness] = station;
      return [x, sign * (back + (edge - back) * bands[j]), underside ? -.029 : height[j] * thickness];
    };
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i], b = stations[i + 1];
      for (let j = 0; j < bands.length - 1; j++) {
        const p = vertex(a,j), q = vertex(a,j+1), r = vertex(b,j), s = vertex(b,j+1);
        position.push(...p,...q,...r,...r,...q,...s); materialIDs.push(j >= 2 ? 1 : 0);
      }
      for (const j of [0, bands.length - 1]) {
        const p = vertex(a,j), q = vertex(a,j,true), r = vertex(b,j), s = vertex(b,j,true);
        position.push(...p,...r,...q,...r,...s,...q); materialIDs.push(1);
      }
      const p = vertex(a,0,true), q = vertex(a,4,true), r = vertex(b,0,true), s = vertex(b,4,true);
      position.push(...p,...r,...q,...q,...r,...s); materialIDs.push(0);
    }
    const geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute(position,3));
    geometry.computeVertexNormals();
    materialIDs.forEach((mat, i) => geometry.addGroup(i * 6, 6, mat));
    mesh(parent, geometry, [steel, polished]);
  }
  function half(sign) {
    const part = new T.Group();
    part.position.z = sign > 0 ? .018 : -.073;
    group.add(part);
    blade(part, sign);
    const thumb = sign < 0, cx = thumb ? -1.66 : -1.94, cy = -sign * (thumb ? .34 : .28);
    const path = [[.15,-sign*.012,0],[-.04,-sign*.013,0],[-.32,-sign*.006,-.002],[-.77,-sign*.035,-.012],
      [cx+.63,cy*.58,-.015],[cx+.46,cy+.01*sign,.012],[cx+(thumb?.45:.40),cy+.05*sign,.024]];
    tube(part,path,(t)=>.091 + .04 * (1-t)**3 + .025 * t**4,steel);
    fingerRing(part, cx, cy, sign, thumb);
    if (!thumb) {
      tube(part, [[cx-.29,cy-.206,.01],[cx-.47,cy-.215,.008],[cx-.66,cy-.126,.004],
        [cx-.79,cy-.018,.002],[cx-.83,cy+.07,.0]], (t)=>.044 + .025 * (1-t) + .02 * t**4, roseGold);
      const end = mesh(part,new T.SphereGeometry(.066,18,12),roseGold);
      end.position.set(cx-.83,cy+.07,0);
    }
    return part;
  }
  const halves = [half(1), half(-1)];
  function pivot(radius, depth, z, mat) {
    const m = mesh(group, new T.CylinderGeometry(radius,radius,depth,56),mat);
    m.rotation.x = Math.PI / 2;
    m.position.z = z;
  }
  pivot(.196,.105,.115,gunmetal);
  pivot(.176,.035,.181,roseGold);
  const cap = mesh(group,new T.SphereGeometry(.143,32,20),copper);
  cap.scale.z = .31; cap.position.z=.201;
  pivot(.084,.012,.241,steel);
  const slot = mesh(group, new T.CylinderGeometry(.055,.055,.009,6), gunmetal);
  slot.rotation.x=Math.PI/2; slot.position.z=.25;
  return {group, halves, release() {
    group.traverse((m)=>m.geometry?.dispose());
    [steel,polished,copper,roseGold,gunmetal].forEach(m=>m.dispose());
    map.dispose();
  }};
}

function renderShears(T, host, stillImage, motion) {
  const renderer = new T.WebGLRenderer({alpha:true, antialias:true, powerPreference:'low-power'});
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = T.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden','true');
  Object.assign(canvas.style,{display:'block',width:'100%',height:'100%',position:'absolute',inset:'0',pointerEvents:'none'});
  host.append(canvas);
  const camera = new T.OrthographicCamera(-3,3,2,-2,.1,50);
  camera.position.set(.19,-.05,10);
  const scene = new T.Scene(), shears = makeShears(T);
  scene.add(shears.group);
  let visible = true, lost = false, frame = 0, last = 0, elapsed = 0;
  let pointerX = 0, pointerY = 0, tiltX = 0, tiltY = 0;
  const draw = (dt) => {
    elapsed += dt;
    const phase = elapsed % 5.6;
    const pulse = (center, duration) => {
      const d = clamp(Math.abs(phase-center)/duration);
      return (1 + Math.cos(d*Math.PI))*.5;
    };
    const snip = .71*pulse(2.3,.64)+.59*pulse(3.25,.44);
    const angle = .304 - .282*snip + .017*Math.sin(elapsed*.83);
    const blend = 1-Math.exp(-dt*6);
    tiltX += (pointerX-tiltX)*blend; tiltY += (pointerY-tiltY)*blend;
    shears.halves[0].rotation.z = angle;
    shears.halves[1].rotation.z = -angle;
    shears.group.rotation.set(-.25+tiltY*.11, -.16+tiltX*.15+.028*Math.sin(elapsed*.53), .380+.025*Math.sin(elapsed*.55), 'ZXY');
    renderer.render(scene,camera);
    stillImage.style.opacity='0';
  };
  const resize = () => {
    const w = Math.round(host.clientWidth), h = Math.round(host.clientHeight);
    if (!w || !h || lost) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,1.8));
    renderer.setSize(w,h,false);
    const aspect=w/h, halfH=Math.max(2.22,2.96/aspect);
    camera.left=-halfH*aspect; camera.right=halfH*aspect; camera.top=halfH; camera.bottom=-halfH;
    camera.updateProjectionMatrix();
    draw(0);
  };
  const tick = (time) => {
    if (last===0 || time-last>=33) { const dt=last?Math.min((time-last)/1000,.1):0; last=time; draw(dt); }
    frame=requestAnimationFrame(tick);
  };
  const update = () => {
    cancelAnimationFrame(frame); frame=0; last=0;
    if (visible && !lost && !document.hidden && !motion.matches) frame=requestAnimationFrame(tick);
  };
  const intersection = new IntersectionObserver(([entry])=>{visible=entry.isIntersecting; update()});
  intersection.observe(host);
  const ro = new ResizeObserver(resize); ro.observe(host);
  const pointer = (e) => {
    const b=host.getBoundingClientRect(); pointerX=clamp((e.clientX-b.left)/b.width*2-1,-1,1); pointerY=clamp((e.clientY-b.top)/b.height*2-1,-1,1);
  };
  const leave = () => { pointerX=0; pointerY=0; };
  const parent=host.parentElement || host;
  parent.addEventListener('pointermove',pointer,{passive:true}); parent.addEventListener('pointerleave',leave);
  document.addEventListener('visibilitychange',update);
  const onLoss = () => { lost=true; stillImage.style.opacity='1'; update(); };
  canvas.addEventListener('webglcontextlost',onLoss);
  resize(); update();
  return () => {
    lost=true; cancelAnimationFrame(frame); intersection.disconnect(); ro.disconnect();
    parent.removeEventListener('pointermove',pointer); parent.removeEventListener('pointerleave',leave);
    document.removeEventListener('visibilitychange',update); canvas.removeEventListener('webglcontextlost',onLoss);
    shears.release(); renderer.dispose(); renderer.forceContextLoss(); canvas.remove();
  };
}

class SalonShears extends HTMLElement {
  connectedCallback() {
    if (this._observer) return;
    this.style.display ||= 'block';
    if(getComputedStyle(this).position==='static') this.style.position='relative';
    this.setAttribute('aria-hidden','true');
    const img=document.createElement('img');
    img.src=still.href; img.alt=''; img.draggable=false;
    Object.assign(img.style,{display:'block',width:'100%',height:'100%',objectFit:'contain',pointerEvents:'none',position:'absolute',inset:0});
    this.replaceChildren(img);
    this._motion=window.matchMedia('(prefers-reduced-motion: reduce)');
    this._mode = () => {
      if(this._motion.matches) { this._version++; this._release?.(); this._release=null; img.style.opacity='1'; }
      else if (this._inView) this._start(img);
    };
    this._version=(this._version||0)+1;
    this._motion.addEventListener('change',this._mode);
    this._observer=new IntersectionObserver(([entry])=>{
      this._inView=entry.isIntersecting;
      if(this._inView) this._mode();
    });
    this._observer.observe(this);
  }
  async _start(img) {
    if(this._release || this._loading || this._failed) return;
    const version=this._version;
    this._loading=true;
    try {
      const T=await import(vendor.href);
      if (this.isConnected && !this._motion.matches && version===this._version) this._release=renderShears(T,this,img,this._motion);
    } catch {
      this._failed=true; img.style.opacity='1';
    } finally { this._loading=false; }
  }
  disconnectedCallback() {
    this._version++; this._observer?.disconnect(); this._observer=null;
    this._motion?.removeEventListener('change',this._mode);
    this._release?.(); this._release=null; this._inView=false;
  }
}
if(!customElements.get('salon-shears')) customElements.define('salon-shears',SalonShears);
