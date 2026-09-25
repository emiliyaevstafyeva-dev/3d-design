/**
 * GlowCursor — адаптация React/OGL компонента под статичный сайт.
 * Полноэкранный светящийся след курсора в цветах студии.
 */

const MAX_POINTS = 64;

const VERTEX_SHADER = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

#define MAX_POINTS 64

uniform vec2 uResolution;
uniform vec2 uPoints[MAX_POINTS];
uniform float uPointCount;
uniform vec3 uColor;
uniform vec3 uSecondaryColor;
uniform float uTrailWidth;
uniform float uTaper;
uniform float uGlowIntensity;
uniform float uGlowSpread;
uniform float uHotspot;
uniform float uBrightness;
uniform float uOpacity;
uniform float uPulseSpeed;
uniform float uNoiseStrength;
uniform float uNormalBlend;
uniform float uTime;
uniform float uFade;

varying vec2 vUv;

float sRGB(float x) {
  if (x <= 0.00031308) return 12.92 * x;
  return 1.055 * pow(x, 1.0 / 2.4) - 0.055;
}

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float filmGrain(vec2 p, float time) {
  float frame = time * 18.0;
  float frameIndex = mod(floor(frame), 256.0);
  float nextFrameIndex = mod(frameIndex + 1.0, 256.0);
  float blend = fract(frame);
  blend = blend * blend * (3.0 - 2.0 * blend);
  vec2 pixel = floor(p);
  float current = hash(pixel + vec2(frameIndex * 17.0, frameIndex * 31.0));
  float next = hash(pixel + vec2(nextFrameIndex * 17.0, nextFrameIndex * 31.0));
  return mix(current, next, blend) * 2.0 - 1.0;
}

void main() {
  vec2 pixel = vUv * uResolution;
  float denominator = max(uPointCount - 1.0, 1.0);
  float strongest = 0.0;
  float strongestCore = 0.0;
  float colorWeight = 0.0;
  vec3 colorSum = vec3(0.0);

  for (int i = 0; i < MAX_POINTS - 1; i++) {
    float index = float(i);
    float active = 1.0 - step(uPointCount - 1.0, index);
    vec2 start = uPoints[i];
    vec2 end = uPoints[i + 1];
    vec2 toPixel = pixel - start;
    vec2 segment = end - start;
    float along = clamp(dot(toPixel, segment) / max(dot(segment, segment), 0.0001), 0.0, 1.0);
    float progress = clamp((index + along) / denominator, 0.0, 1.0);
    float life = pow(max(1.0 - progress, 0.0), mix(0.55, 1.25, uTaper));
    float width = uTrailWidth * mix(1.0, 0.25, pow(progress, mix(0.55, 1.6, uTaper)));
    float distanceToTrail = length(toPixel - segment * along);
    float falloff = max(width * (0.8 + uGlowSpread * 1.4), 0.5);
    float beam = min(1.0, (falloff * falloff) / (distanceToTrail * distanceToTrail + falloff * falloff));
    float core = exp(-pow(distanceToTrail / max(width, 0.5), 2.0) * 2.5);
    float pulseAmount = min(abs(uPulseSpeed), 1.0);
    float pulse = 1.0 + sin(uTime * uPulseSpeed * 3.0 - progress * 11.0) * 0.16 * pulseAmount;
    float intensity = (core + beam * uGlowIntensity * 0.55) * life * pulse * active;
    vec3 segmentColor = mix(uColor, uSecondaryColor, progress);

    strongest = max(strongest, intensity);
    strongestCore = max(strongestCore, core * life * active);
    colorSum += segmentColor * intensity;
    colorWeight += intensity;
  }

  float grain = filmGrain(pixel, uTime);
  float noiseAmount = (1.0 - exp(-uNoiseStrength * 2.2)) * 0.4;
  float alpha = clamp(strongest * uOpacity * uFade, 0.0, 1.0);
  if (alpha < 0.0005) discard;

  vec3 color = colorSum / max(colorWeight, 0.0001);
  color = mix(color, vec3(1.0), smoothstep(0.25, 0.95, strongestCore) * uHotspot);
  float luminance = sRGB(clamp(strongest * uBrightness, 0.0, 1.0));
  luminance *= 1.0 + grain * noiseAmount;
  vec3 additiveColor = color * luminance;
  float normalAlpha = clamp(strongest * uBrightness * uOpacity * uFade, 0.0, 1.0);
  vec3 normalColor = mix(color, vec3(1.0), smoothstep(0.45, 1.0, strongestCore) * uHotspot * 0.35);
  gl_FragColor = vec4(mix(additiveColor, normalColor, uNormalBlend), mix(alpha, normalAlpha, uNormalBlend));
}
`;

const CONFIG = {
  color: '#67E8F9',
  secondaryColor: '#A5F3FC',
  trailLength: 40,
  trailWidth: 8,
  trailTaper: 0.8,
  followSpeed: 0.16,
  glowIntensity: 1.9,
  glowSpread: 1.2,
  hotspot: 0.65,
  brightness: 1.25,
  opacity: 1,
  pulseSpeed: 1.1,
  noiseStrength: 0.035,
  idleFade: true,
  idleTimeout: 700,
  fadeDuration: 900,
  blendMode: 'screen',
  maxDevicePixelRatio: 1.5,
};

function hexToRgb(hex) {
  let value = (hex || '').replace('#', '').trim();
  if (value.length === 3) {
    value = value
      .split('')
      .map(function (char) {
        return char + char;
      })
      .join('');
  }
  const parsed = Number.parseInt(value || '000000', 16);
  return [((parsed >> 16) & 255) / 255, ((parsed >> 8) & 255) / 255, (parsed & 255) / 255];
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function shouldEnable() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  if (window.matchMedia('(pointer: coarse)').matches && !window.matchMedia('(pointer: fine)').matches) {
    return false;
  }
  if (window.innerWidth < 900) return false;
  return true;
}

async function initGlowCursor() {
  const container = document.getElementById('glow-cursor');
  const canvas = container && container.querySelector('.glow-cursor__canvas');
  if (!container || !canvas) return;

  if (!shouldEnable()) {
    container.classList.add('is-disabled');
    return;
  }

  let Renderer;
  let Program;
  let Mesh;
  let Triangle;

  try {
    const ogl = await import('https://esm.sh/ogl@1.0.10');
    Renderer = ogl.Renderer;
    Program = ogl.Program;
    Mesh = ogl.Mesh;
    Triangle = ogl.Triangle;
  } catch (err) {
    console.warn('GlowCursor: не удалось загрузить OGL', err);
    container.classList.add('is-disabled');
    return;
  }

  canvas.style.mixBlendMode = CONFIG.blendMode;

  let renderer;
  try {
    renderer = new Renderer({
      canvas: canvas,
      alpha: true,
      dpr: Math.min(window.devicePixelRatio || 1, CONFIG.maxDevicePixelRatio),
    });
  } catch (err) {
    container.classList.add('is-disabled');
    return;
  }

  const gl = renderer.gl;
  gl.clearColor(0, 0, 0, 0);

  const pointData = Array(MAX_POINTS * 2).fill(0);
  const points = Array.from({ length: MAX_POINTS }, function () {
    return { x: 0, y: 0 };
  });
  const target = { x: 0, y: 0 };
  const head = { x: 0, y: 0 };

  const program = new Program(gl, {
    vertex: VERTEX_SHADER,
    fragment: FRAGMENT_SHADER,
    uniforms: {
      uResolution: { value: [1, 1] },
      uPoints: { value: pointData },
      uPointCount: { value: CONFIG.trailLength },
      uColor: { value: hexToRgb(CONFIG.color) },
      uSecondaryColor: { value: hexToRgb(CONFIG.secondaryColor) },
      uTrailWidth: { value: CONFIG.trailWidth },
      uTaper: { value: CONFIG.trailTaper },
      uGlowIntensity: { value: CONFIG.glowIntensity },
      uGlowSpread: { value: CONFIG.glowSpread },
      uHotspot: { value: CONFIG.hotspot },
      uBrightness: { value: CONFIG.brightness },
      uOpacity: { value: CONFIG.opacity },
      uPulseSpeed: { value: CONFIG.pulseSpeed },
      uNoiseStrength: { value: CONFIG.noiseStrength },
      uNormalBlend: { value: CONFIG.blendMode === 'normal' ? 1 : 0 },
      uTime: { value: 0 },
      uFade: { value: 0 },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const mesh = new Mesh(gl, { geometry: new Triangle(gl), program: program });

  let width = 1;
  let height = 1;
  let initialized = false;
  let pointerInside = false;
  let fade = 0;
  let lastInputTime = performance.now();
  let lastFrameTime = performance.now();
  let raf = 0;
  let destroyed = false;

  const resize = function () {
    if (!shouldEnable()) {
      container.classList.add('is-disabled');
      return;
    }
    container.classList.remove('is-disabled');
    width = Math.max(window.innerWidth, 1);
    height = Math.max(window.innerHeight, 1);
    renderer.setSize(width, height);
    program.uniforms.uResolution.value = [width, height];
  };

  const initializeTrail = function (x, y) {
    target.x = x;
    target.y = y;
    head.x = x;
    head.y = y;
    for (let i = 0; i < points.length; i++) {
      points[i].x = x;
      points[i].y = y;
    }
    initialized = true;
    fade = 1;
  };

  const updatePointer = function (event) {
    if (container.classList.contains('is-disabled')) return;
    const x = clamp(event.clientX, 0, width);
    const y = clamp(height - event.clientY, 0, height);
    if (!initialized) initializeTrail(x, y);
    target.x = x;
    target.y = y;
    pointerInside = true;
    lastInputTime = performance.now();
  };

  const onPointerLeave = function () {
    pointerInside = false;
    lastInputTime = performance.now();
  };

  const render = function (now) {
    if (destroyed) return;
    if (container.classList.contains('is-disabled')) {
      raf = requestAnimationFrame(render);
      return;
    }

    const config = CONFIG;
    const delta = Math.min((now - lastFrameTime) / 16.667, 3);
    lastFrameTime = now;

    if (initialized) {
      const headEase = 1 - Math.pow(1 - clamp(config.followSpeed, 0.01, 0.99), delta);
      const chainBase = clamp(0.28 + config.followSpeed * 0.35, 0.08, 0.92);
      const chainEase = 1 - Math.pow(1 - chainBase, delta);
      head.x += (target.x - head.x) * headEase;
      head.y += (target.y - head.y) * headEase;
      points[0].x = head.x;
      points[0].y = head.y;

      for (let i = 1; i < MAX_POINTS; i++) {
        points[i].x += (points[i - 1].x - points[i].x) * chainEase;
        points[i].y += (points[i - 1].y - points[i].y) * chainEase;
      }

      for (let i = 0; i < MAX_POINTS; i++) {
        pointData[i * 2] = points[i].x;
        pointData[i * 2 + 1] = points[i].y;
      }
    }

    const idleFor = now - lastInputTime;
    const shouldFade = config.idleFade && (!pointerInside || idleFor > config.idleTimeout);
    const fadeStep = (16.667 * delta) / Math.max(config.fadeDuration, 16);
    const fadeTarget = initialized && !shouldFade ? 1 : 0;
    fade += (fadeTarget - fade) * Math.min(1, fadeStep * 7);

    program.uniforms.uPointCount.value = clamp(Math.round(config.trailLength), 2, MAX_POINTS);
    program.uniforms.uTime.value = now * 0.001;
    program.uniforms.uFade.value = fade;

    renderer.render({ scene: mesh });
    if (!destroyed) raf = requestAnimationFrame(render);
  };

  window.addEventListener('pointermove', updatePointer, { passive: true });
  window.addEventListener('pointerdown', updatePointer, { passive: true });
  document.documentElement.addEventListener('mouseleave', onPointerLeave);
  window.addEventListener('blur', onPointerLeave);
  window.addEventListener('resize', resize);

  resize();
  raf = requestAnimationFrame(render);

  window.addEventListener('beforeunload', function () {
    destroyed = true;
    cancelAnimationFrame(raf);
  });
}

initGlowCursor();
