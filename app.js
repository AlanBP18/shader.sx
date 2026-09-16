/**
 * Organic Animal Print 3D WebGL Shader Background
 * High-performance procedural gyroid / minimal surface level-set simulation
 * with 7 clean organic shapes (Tréboles, Cebra, Coral, Ondas, Gotas, Corazones, Huesitos)
 * and moving rainbow swirl + diagonal gradient
 */

(function () {
  'use strict';

  // --- GLSL Shaders ---
  const VERTEX_SHADER_SOURCE = `#version 300 es
in vec2 a_position;
out vec2 v_uv;

void main() {
    v_uv = (a_position + 1.0) * 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

  const FRAGMENT_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform vec2 u_resolution;
uniform float u_time;
uniform vec2 u_mouse;
uniform float u_scale;
uniform float u_speed;
uniform float u_bgSpeed;
uniform float u_thickness;
uniform float u_depth;
uniform float u_mouseForce;
uniform float u_mouseRadius;
uniform float u_clickRipple;
uniform vec2 u_clickPos;
uniform int u_colorMode;
uniform int u_shapeMode;
uniform float u_saturation;
uniform float u_shadows;
uniform float u_specular;
uniform int u_transparent;

const mat3 R_DIAG = mat3(
    0.70710678, -0.70710678, 0.0,
    0.40824829,  0.40824829, -0.81649658,
    0.57735027,  0.57735027,  0.57735027
);

const mat3 R_ZEBRA = mat3(
    0.8528685, -0.4770304,  0.2131972,
    0.3894183,  0.8466101,  0.3625385,
   -0.3474937, -0.2370356,  0.9071539
);

// Precalculated static vectors to avoid per-pixel normalize()
const vec3 LIGHT_DIR = vec3(-0.4137065, 0.5641453, 0.714584); // normalize(vec3(-0.55, 0.75, 0.95))
const vec3 HALF_VEC = vec3(-0.2234057, 0.3046441, 0.925893);  // normalize(LIGHT_DIR + vec3(0.0, 0.0, 1.0))
const vec2 SHADOW_DIR = vec2(0.591361, -0.806401);           // normalize(vec2(0.55, -0.75))

vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.2831853 * (c * t + d));
}

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float dot2(in vec2 v) { return dot(v, v); }

float sdHeart(vec2 p) {
    p.y += 0.48;
    p.x = abs(p.x);
    if (p.y + p.x > 1.0)
        return sqrt(dot2(p - vec2(0.25, 0.75))) - 0.35355339;
    return sqrt(min(dot2(p - vec2(0.00, 1.00)),
                    dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}

float sdBone(vec2 p) {
    p = abs(p);
    float dKnuckle = length(p - vec2(0.34, 0.16)) - 0.16;
    float dx = max(0.0, p.x - 0.30);
    float dShaft = length(vec2(dx, p.y)) - 0.10;
    return smin(dKnuckle, dShaft, 0.12);
}

float evalG(vec2 uv, float t) {
    vec2 mPos = (u_mouse - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y) * u_scale;
    vec2 dM = uv - mPos;
    float dMLen = length(dM);
    float mRad = u_mouseRadius * 3.5;
    float mInfluence = exp(-dMLen * dMLen / max(0.01, mRad * mRad)) * u_mouseForce * 2.2;
    uv -= normalize(dM + 1e-4) * mInfluence;

    if (u_clickRipple > 0.0 && u_clickRipple < 2.5) {
        vec2 cPos = (u_clickPos - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y) * u_scale;
        vec2 dC = uv - cPos;
        float dCLen = length(dC);
        float wave = sin(dCLen * 0.8 - u_clickRipple * 9.0) * exp(-u_clickRipple * 1.5) * exp(-dCLen * 0.08);
        uv += normalize(dC + 1e-4) * wave * 2.0;
    }

    if (u_shapeMode == 0) {
        // Tréboles 3D
        vec2 warp0 = vec2(sin(uv.y * 0.075 + t * 0.12), cos(uv.x * 0.075 + t * 0.10)) * 2.2;
        vec2 pos = uv + warp0;
        vec3 p = R_DIAG * vec3(pos, t * u_speed * 0.40);
        float g = sin(p.x) * cos(p.y) + sin(p.y) * cos(p.z) + sin(p.z) * cos(p.x);
        float term = sin(pos.x * 0.06 + t * 0.06) * cos(pos.y * 0.06 - t * 0.05);
        return g + term * 0.18;
    } else if (u_shapeMode == 1) {
        // Cebra / Laberinto
        vec2 warp1 = vec2(
            sin(uv.y * 0.065 + t * 0.14) + sin(uv.x * 0.035 - t * 0.08),
            cos(uv.x * 0.065 + t * 0.11) + cos(uv.y * 0.035 + t * 0.09)
        ) * 3.0;
        vec2 pos = uv + warp1;
        vec3 p = R_ZEBRA * vec3(pos * 0.85, t * u_speed * 0.38);
        float g = sin(p.x) * cos(p.y) + sin(p.y) * cos(p.z) + sin(p.z) * cos(p.x);
        g += sin(p.x * 1.6 + p.y * 0.8 + t * 0.25) * 0.16;
        return g;
    } else if (u_shapeMode == 2) {
        // Coral / Células
        vec2 p = uv * 0.26;
        vec2 warp2 = vec2(sin(p.y * 0.9 + t * 0.16), cos(p.x * 0.9 + t * 0.13)) * 0.9;
        p += warp2;
        float c1 = cos(p.x + t * u_speed * 0.26);
        float c2 = cos(-0.5 * p.x + 0.866025 * p.y + t * u_speed * 0.23);
        float c3 = cos(-0.5 * p.x - 0.866025 * p.y - t * u_speed * 0.20);
        return (c1 * c2 + c2 * c3 + c3 * c1) + 0.48;
    } else if (u_shapeMode == 3) {
        // Ondas Líquidas
        vec2 p = uv * 0.28;
        float waveWarp = sin(p.x * 0.45 + p.y * 0.3 + t * 0.18) * 1.6;
        return sin(p.y * 1.25 + waveWarp + t * u_speed * 0.52) 
             + 0.52 * sin(p.x * 0.85 - p.y * 0.65 - t * u_speed * 0.38)
             + 0.28 * cos(p.x * 1.4 + t * 0.22);
    } else if (u_shapeMode == 4) {
        // Gotas Bio
        vec2 p = uv * 0.22;
        vec2 warp4 = vec2(sin(p.y * 0.95 + t * 0.2), cos(p.x * 0.95 - t * 0.18)) * 1.3;
        p += warp4;
        return sin(p.x * 1.15) * cos(p.y * 1.15) 
             + cos(p.x * 0.72 - t * u_speed * 0.32) * sin(p.y * 0.72 + t * u_speed * 0.28) - 0.32;
    } else if (u_shapeMode == 5) {
        // Corazones 3D Limpios y Rellenos
        vec2 p = uv * 0.15;
        float minDist = 1e4;
        vec2 id = floor(p);
        vec2 f = fract(p) - 0.5;

        for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
                vec2 g = vec2(float(i), float(j));
                vec2 cid = id + g;
                float h1 = sin(cid.x * 13.17 + cid.y * 79.43);
                float h2 = cos(cid.x * 47.21 + cid.y * 23.85);
                
                vec2 center = g + vec2(
                    sin(t * 0.35 * u_speed + h1 * 6.28),
                    cos(t * 0.30 * u_speed + h2 * 6.28)
                ) * 0.28;
                vec2 localP = f - center;

                float beat = 1.0 + 0.08 * sin(t * 3.0 * u_speed + h1 * 5.0);
                float ang = sin(t * 0.22 * u_speed + h1 * 4.0) * 0.32 + h2 * 0.45;
                float cosA = cos(ang), sinA = sin(ang);
                vec2 rotP = vec2(localP.x * cosA - localP.y * sinA, localP.x * sinA + localP.y * cosA);

                float d = sdHeart(rotP / (0.52 * beat)) * (0.52 * beat);
                minDist = smin(minDist, d, 0.16);
            }
        }
        return minDist;
    } else {
        // Huesos de Perro 3D Sólidos y Gruesos
        vec2 p = uv * 0.16;
        float minDist = 1e4;
        vec2 id = floor(p);
        vec2 f = fract(p) - 0.5;

        for (int j = -1; j <= 1; j++) {
            for (int i = -1; i <= 1; i++) {
                vec2 g = vec2(float(i), float(j));
                vec2 cid = id + g;
                float h1 = sin(cid.x * 19.33 + cid.y * 57.19);
                float h2 = cos(cid.x * 37.77 + cid.y * 91.13);
                
                vec2 center = g + vec2(
                    sin(t * 0.32 * u_speed + h1 * 6.28),
                    cos(t * 0.28 * u_speed + h2 * 6.28)
                ) * 0.26;
                vec2 localP = f - center;

                float ang = h1 * 3.14 + t * 0.20 * u_speed * (h2 > 0.0 ? 1.0 : -1.0);
                float cosA = cos(ang), sinA = sin(ang);
                vec2 rotP = vec2(localP.x * cosA - localP.y * sinA, localP.x * sinA + localP.y * cosA);

                float d = sdBone(rotP / 0.52) * 0.52;
                minDist = smin(minDist, d, 0.16);
            }
        }
        return minDist;
    }
}

float getHeight(vec2 uv, float t) {
    if (u_shapeMode >= 5) {
        float d = evalG(uv, t);
        float w = u_thickness * 0.45;
        if (d >= w) return 0.0;
        if (d > 0.0) {
            float f = 1.0 - (d / w);
            return sqrt(f * (2.0 - f)) * 0.82;
        } else {
            float inner = clamp(-d / (w * 1.6), 0.0, 1.0);
            return 0.82 + 0.18 * sqrt(inner * (2.0 - inner));
        }
    } else {
        // Cordones tubulares orgánicos continuos (Tréboles, Cebra, Coral, Ondas, Gotas)
        float gC = evalG(uv, t);
        // ponytail: valley bound skips neighbor evaluations if gC is clearly outside cord boundary
        if (abs(gC) >= u_thickness * 3.2) return 0.0;

        float delta = 0.035;
        // Forward difference: 2 evaluations instead of 4 central difference evaluations
        float gR = evalG(uv + vec2(delta, 0.0), t);
        float gT = evalG(uv + vec2(0.0, delta), t);

        float gx = (gR - gC) / delta;
        float gy = (gT - gC) / delta;
        float gradLen = length(vec2(gx, gy));

        float dist = abs(gC) / max(0.12, gradLen);
        float width = u_thickness;
        if (dist >= width) return 0.0;

        float normDist = dist / width;
        float h = sqrt(max(0.0, 1.0 - normDist * normDist));
        h *= smoothstep(1.0, 0.86, normDist);
        return h;
    }
}

vec3 getPastelSwirlWithDiagonalGradient(vec2 p, float t) {
    float bgT = t * u_bgSpeed;
    vec2 pNorm = p * 0.07;
    vec2 center = vec2(sin(bgT * 0.22) * 1.2, cos(bgT * 0.18) * 0.9);
    vec2 d = pNorm - center;
    float r = length(d);
    float angle = atan(d.y, d.x);

    float swirlAngle = angle + (3.8 / (r * 0.35 + 0.85)) + bgT * 0.45;
    float spiralPhase = swirlAngle * 0.5 + r * 0.32 - bgT * 0.35;

    // Paleta de arcoíris pastel rica, vibrante y definida
    vec3 a = vec3(0.68, 0.65, 0.74);
    vec3 b = vec3(0.32, 0.35, 0.30);
    vec3 c = vec3(1.0, 1.0, 1.0);
    vec3 d_param = vec3(0.05, 0.38, 0.70);
    vec3 swirlCol = cosPalette(spiralPhase, a, b, c, d_param);

    // Segundo armónico del remolino (Menta y Amarillo vibrantes)
    float swirlArm2 = sin(swirlAngle * 2.2 - r * 0.4 + bgT * 0.3);
    vec3 mintYellow = mix(vec3(0.38, 0.90, 0.74), vec3(0.99, 0.86, 0.38), swirlArm2 * 0.5 + 0.5);
    swirlCol = mix(swirlCol, mintYellow, 0.40);

    // 2. Gradiente pasando de manera diagonal continua por encima (Tonos vivos bien perceptibles)
    float diagCoord = (pNorm.x * 0.7071068 + pNorm.y * 0.7071068) * 1.1 - bgT * 0.65;

    vec3 diagColPeach = vec3(0.99, 0.58, 0.52); // Melocotón / Rosa vivo
    vec3 diagColCyan  = vec3(0.28, 0.76, 0.98); // Celeste cielo intenso
    vec3 diagColLilac = vec3(0.78, 0.48, 0.96); // Lavanda / Violeta
    vec3 diagColGold  = vec3(0.99, 0.82, 0.32); // Amarillo dorado cálido

    float diagWave1 = sin(diagCoord * 2.0);
    float diagWave2 = cos(diagCoord * 1.6 + 1.2);
    
    vec3 diagGrad = mix(diagColPeach, diagColCyan, diagWave1 * 0.5 + 0.5);
    diagGrad = mix(diagGrad, diagColLilac, diagWave2 * 0.5 + 0.5);
    diagGrad = mix(diagGrad, diagColGold, sin(diagCoord * 2.8) * 0.30 + 0.30);

    // Resalte luminoso diagonal sutil para no blanquear el color
    float sheen = pow(max(0.0, sin(diagCoord * 1.25)), 8.0) * 0.16;

    // Fusión armónica con predominio de colores vivos
    vec3 finalBg = mix(swirlCol, diagGrad, 0.48) + sheen;
    return finalBg;
}

void getColorTheme(vec2 p, float t, out vec3 tubeColor, out vec3 bgColor, out vec3 lightTint) {
    if (u_colorMode == 0) {
        tubeColor = vec3(0.965, 0.965, 0.975);
        bgColor = getPastelSwirlWithDiagonalGradient(p, t);
        lightTint = vec3(1.0, 0.98, 0.96);
    } else if (u_colorMode == 1) {
        tubeColor = vec3(0.95, 0.95, 0.96);
        float diagCoord = (p.x * 0.7071 + p.y * 0.7071) * 0.08 - t * u_bgSpeed * 0.5;
        float darkWave = sin(diagCoord * 2.0) * 0.05;
        bgColor = vec3(0.11 + darkWave, 0.11 + darkWave, 0.13 + darkWave);
        lightTint = vec3(1.0, 1.0, 1.0);
    } else if (u_colorMode == 2) {
        tubeColor = vec3(0.98, 0.95, 0.98);
        float bgT = t * u_bgSpeed;
        vec2 pN = p * 0.07;
        vec2 d = pN - vec2(sin(bgT * 0.2), cos(bgT * 0.2));
        float r = length(d);
        float ang = atan(d.y, d.x) + 3.0 / (r * 0.4 + 1.0) + bgT * 0.5;
        vec3 cPink = vec3(1.0, 0.55, 0.78);
        vec3 cCyan = vec3(0.45, 0.88, 0.98);
        vec3 cPurp = vec3(0.78, 0.58, 0.96);
        vec3 swirl = mix(cPink, cCyan, sin(ang * 2.0 + r * 0.3) * 0.5 + 0.5);
        swirl = mix(swirl, cPurp, 0.35);
        float diag = (pN.x + pN.y) * 0.8 - bgT * 0.6;
        vec3 diagCol = mix(cCyan, cPink, sin(diag * 2.0) * 0.5 + 0.5);
        bgColor = mix(swirl, diagCol, 0.5) + pow(max(0.0, sin(diag)), 8.0) * 0.25;
        lightTint = vec3(1.0, 0.96, 1.0);
    } else if (u_colorMode == 3) {
        tubeColor = vec3(0.97, 0.96, 0.93);
        float bgT = t * u_bgSpeed;
        vec2 pN = p * 0.07;
        vec2 d = pN - vec2(cos(bgT * 0.18), sin(bgT * 0.18));
        float r = length(d);
        float ang = atan(d.y, d.x) + 3.5 / (r * 0.4 + 1.0) + bgT * 0.4;
        vec3 cCoral = vec3(0.98, 0.52, 0.42);
        vec3 cTeal  = vec3(0.25, 0.78, 0.75);
        vec3 cGold  = vec3(0.98, 0.82, 0.45);
        vec3 swirl = mix(cCoral, cTeal, sin(ang * 2.0 + r * 0.25) * 0.5 + 0.5);
        swirl = mix(swirl, cGold, 0.35);
        float diag = (pN.x + pN.y) * 0.8 - bgT * 0.55;
        vec3 diagG = mix(cTeal, cCoral, sin(diag * 1.8) * 0.5 + 0.5);
        bgColor = mix(swirl, diagG, 0.45) + pow(max(0.0, sin(diag)), 6.0) * 0.22;
        lightTint = vec3(1.0, 0.97, 0.92);
    } else if (u_colorMode == 4) {
        tubeColor = vec3(0.92, 0.98, 1.0);
        float bgT = t * u_bgSpeed;
        vec2 pN = p * 0.07;
        vec2 d = pN - vec2(sin(bgT * 0.25), cos(bgT * 0.2));
        float r = length(d);
        float ang = atan(d.y, d.x) + 4.0 / (r * 0.3 + 1.0) + bgT * 0.6;
        vec3 cDark = vec3(0.06, 0.07, 0.12);
        vec3 cNeon1 = vec3(0.0, 0.88, 0.92);
        vec3 cNeon2 = vec3(0.94, 0.15, 0.65);
        vec3 neonSwirl = mix(cNeon1, cNeon2, sin(ang * 2.0 + r * 0.3) * 0.5 + 0.5);
        float diag = (pN.x + pN.y) * 0.9 - bgT * 0.8;
        float beam = pow(max(0.0, sin(diag)), 10.0) * 0.6;
        bgColor = mix(cDark, neonSwirl * 0.55, 0.7) + cNeon1 * beam;
        lightTint = vec3(0.85, 0.95, 1.0);
    } else {
        tubeColor = vec3(0.98, 0.97, 0.95);
        float bgT = t * u_bgSpeed;
        vec2 pN = p * 0.07;
        vec2 d = pN - vec2(cos(bgT * 0.2), sin(bgT * 0.15));
        float r = length(d);
        float ang = atan(d.y, d.x) + 3.0 / (r * 0.35 + 1.0) + bgT * 0.35;
        vec3 cGold = vec3(0.94, 0.82, 0.58);
        vec3 cRose = vec3(0.92, 0.76, 0.78);
        vec3 cSilk = vec3(0.95, 0.91, 0.84);
        vec3 swirl = mix(cGold, cRose, sin(ang * 2.0 + r * 0.2) * 0.5 + 0.5);
        swirl = mix(swirl, cSilk, 0.4);
                float diag = (pN.x + pN.y) * 0.8 - bgT * 0.5;
        vec3 diagG = mix(cRose, cGold, sin(diag * 1.5) * 0.5 + 0.5);
        bgColor = mix(swirl, diagG, 0.45) + pow(max(0.0, sin(diag)), 7.0) * 0.3;
        lightTint = vec3(1.0, 0.98, 0.92);
    }

    // Apply saturation modifier with enriched chromatic punch
    float lum = dot(bgColor, vec3(0.299, 0.587, 0.114));
    bgColor = mix(vec3(lum), bgColor, max(0.0, u_saturation * 1.22));
}

void main() {
    // Screen coordinates with aspect correction
    vec2 uv = (gl_FragCoord.xy - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y);
    uv *= u_scale;
    float t = u_time;

    // Calculate height at current pixel
    float hC = getHeight(uv, t);

    // Vignette
    vec2 screenUV = gl_FragCoord.xy / u_resolution;
    float vig = clamp(1.0 - length((screenUV - 0.5) * 0.65), 0.88, 1.0);

    // Colors
    vec3 tubeBaseCol, bgCol, lightTint;
    getColorTheme(uv, t, tubeBaseCol, bgCol, lightTint);

    float eps = (u_scale / min(u_resolution.x, u_resolution.y)) * 0.45;

    // ponytail: early exit for valley floor (~60% of screen). Skips normal sampling & tube shading entirely!
    if (hC <= 0.0) {
        if (u_transparent == 1) {
            fragColor = vec4(0.0);
            return;
        }
        float dropShadow = 1.0;
        if (u_shadows > 0.01) {
            float hShadowSample = getHeight(uv - SHADOW_DIR * (eps * 3.8), t);
            dropShadow = 1.0 - smoothstep(0.05, 0.75, hShadowSample) * u_shadows;
        }
        vec3 valleyLit = bgCol * (dropShadow * 0.98) * vig;
        valleyLit = valleyLit / (valleyLit + vec3(0.36)) * 1.34;
        fragColor = vec4(pow(valleyLit, vec3(1.0 / 2.2)), 1.0);
        return;
    }

    // Forward difference normal: 2 samples (hR, hT) instead of 4 central samples
    float hR = getHeight(uv + vec2(eps, 0.0), t);
    float hT = getHeight(uv + vec2(0.0, eps), t);

    vec3 normal = normalize(vec3(
        -(hR - hC) * u_depth,
        -(hT - hC) * u_depth,
        eps
    ));

    // Soft wrapped diffuse for clay appearance
    float NdotL = dot(normal, LIGHT_DIR);
    float diff = smoothstep(-0.25, 0.95, NdotL);

    // Glossy specular highlight (Blinn-Phong)
    float NdotH = max(0.0, dot(normal, HALF_VEC));
    float spec = pow(NdotH, 22.0) * u_specular;

    // Ambient Occlusion in deep crevices
    float ao = mix(0.42, 1.0, smoothstep(0.0, 0.35, hC));

    // Subsurface bounce: valley colors reflect softly onto the lower flanks of the tubes
    float flankFactor = pow(1.0 - normal.z, 2.0) * (1.0 - hC * 0.5);
    vec3 bounceLight = bgCol * flankFactor * 0.55;

    // Tube final shading
    vec3 tubeLit = tubeBaseCol * (diff * lightTint * 0.82 + 0.32) * ao + spec * lightTint + bounceLight;

    float mask = smoothstep(0.0, 0.08, hC);

    if (u_transparent == 1) {
        vec3 tubeCol = tubeLit * vig;
        tubeCol = tubeCol / (tubeCol + vec3(0.45)) * 1.45;
        tubeCol = pow(tubeCol, vec3(1.0 / 2.2));
        fragColor = vec4(tubeCol * mask, mask);
        return;
    }

    vec3 finalColor;

    // ponytail: skip shadow sample when inside the tube (mask == 1.0)
    if (mask >= 1.0) {
        finalColor = tubeLit;
    } else {
        float dropShadow = 1.0;
        if (u_shadows > 0.01) {
            float hShadowSample = getHeight(uv - SHADOW_DIR * (eps * 3.8), t);
            dropShadow = 1.0 - smoothstep(0.05, 0.75, hShadowSample) * u_shadows * (1.0 - hC);
        }
        vec3 valleyLit = bgCol * dropShadow * 0.96;
        finalColor = mix(valleyLit, tubeLit, mask);
    }

    finalColor *= vig;
    finalColor = finalColor / (finalColor + vec3(0.45)) * 1.45;
    finalColor = pow(finalColor, vec3(1.0 / 2.2));

    fragColor = vec4(finalColor, 1.0);
}`;

  // --- Configuration & Default State ---
  const state = {
    shapeMode: 0, // 0..6
    scale: 44.0,
    speed: 0.75,
    bgSpeed: 1.0,
    thickness: 0.52,
    depth: 1.6,
    mouseForce: 0.55,
    mouseRadius: 1.5,
    colorMode: 0,
    saturation: 1.0,
    shadows: 0.75,
    specular: 0.85,
    transparent: 0
  };

  const SHAPES = [
    { name: 'Tréboles 3D', scale: 44.0, thickness: 0.52 },
    { name: 'Cebra Flow', scale: 42.0, thickness: 0.50 },
    { name: 'Coral / Células', scale: 38.0, thickness: 0.54 },
    { name: 'Ondas Seda', scale: 36.0, thickness: 0.48 },
    { name: 'Gotas Bio', scale: 34.0, thickness: 0.55 },
    { name: 'Corazones', scale: 28.0, thickness: 0.54 },
    { name: 'Huesitos', scale: 26.0, thickness: 0.56 }
  ];

  const PRESETS = [
    {
      name: 'Pastel Clay (Original)',
      colorMode: 0,
      scale: 44.0,
      speed: 0.75,
      bgSpeed: 1.0,
      thickness: 0.52,
      depth: 1.6,
      saturation: 1.0,
      shadows: 0.75,
      specular: 0.85
    },
    {
      name: 'Zebra Minimal',
      colorMode: 1,
      scale: 46.0,
      speed: 0.6,
      bgSpeed: 0.8,
      thickness: 0.54,
      depth: 2.0,
      saturation: 0.0,
      shadows: 0.95,
      specular: 0.6
    },
    {
      name: 'Cotton Candy',
      colorMode: 2,
      scale: 42.0,
      speed: 0.9,
      bgSpeed: 1.2,
      thickness: 0.50,
      depth: 1.5,
      saturation: 1.25,
      shadows: 0.6,
      specular: 1.0
    },
    {
      name: 'Coral Reef',
      colorMode: 3,
      scale: 46.0,
      speed: 0.70,
      bgSpeed: 0.9,
      thickness: 0.52,
      depth: 1.8,
      saturation: 1.15,
      shadows: 0.7,
      specular: 0.8
    },
    {
      name: 'Cyber Neon',
      colorMode: 4,
      scale: 40.0,
      speed: 1.1,
      bgSpeed: 1.4,
      thickness: 0.48,
      depth: 1.9,
      saturation: 1.4,
      shadows: 0.85,
      specular: 1.4
    },
    {
      name: 'Golden Pearl',
      colorMode: 5,
      scale: 45.0,
      speed: 0.65,
      bgSpeed: 0.85,
      thickness: 0.50,
      depth: 1.6,
      saturation: 1.0,
      shadows: 0.65,
      specular: 1.2
    }
  ];

  // --- WebGL Setup ---
  const canvas = document.getElementById('gl-canvas');
  // ponytail: antialias:false saves framebuffer memory & bandwidth on fullscreen quad;
  // powerPreference:'default' uses energy-efficient iGPU instead of forcing dedicated GPU
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    powerPreference: 'default'
  });

  if (!gl) {
    alert('WebGL 2 no está soportado en este navegador. Por favor utiliza Chrome, Edge o Firefox.');
    return;
  }

  function compileShader(type, source) {
    const s = gl.createShader(type);
    gl.shaderSource(s, source);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error('Shader compile error:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  const vertShader = compileShader(gl.VERTEX_SHADER, VERTEX_SHADER_SOURCE);
  const fragShader = compileShader(gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SOURCE);

  if (!vertShader || !fragShader) {
    console.error('No se pudieron compilar los shaders.');
    return;
  }

  const program = gl.createProgram();
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Program link error:', gl.getProgramInfoLog(program));
    return;
  }
  gl.useProgram(program);

  // Fullscreen quad buffer
  const quadVAO = gl.createVertexArray();
  gl.bindVertexArray(quadVAO);
  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );
  const posLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // Uniform locations cache
  const uniforms = {
    resolution: gl.getUniformLocation(program, 'u_resolution'),
    time: gl.getUniformLocation(program, 'u_time'),
    mouse: gl.getUniformLocation(program, 'u_mouse'),
    scale: gl.getUniformLocation(program, 'u_scale'),
    speed: gl.getUniformLocation(program, 'u_speed'),
    bgSpeed: gl.getUniformLocation(program, 'u_bgSpeed'),
    thickness: gl.getUniformLocation(program, 'u_thickness'),
    depth: gl.getUniformLocation(program, 'u_depth'),
    mouseForce: gl.getUniformLocation(program, 'u_mouseForce'),
    mouseRadius: gl.getUniformLocation(program, 'u_mouseRadius'),
    clickRipple: gl.getUniformLocation(program, 'u_clickRipple'),
    clickPos: gl.getUniformLocation(program, 'u_clickPos'),
    colorMode: gl.getUniformLocation(program, 'u_colorMode'),
    shapeMode: gl.getUniformLocation(program, 'u_shapeMode'),
    saturation: gl.getUniformLocation(program, 'u_saturation'),
    shadows: gl.getUniformLocation(program, 'u_shadows'),
    specular: gl.getUniformLocation(program, 'u_specular'),
    transparent: gl.getUniformLocation(program, 'u_transparent')
  };

  // --- Interaction Tracking with Smooth Damping (Lerp) ---
  let dpr = 1.0;
  let winHeight = window.innerHeight;
  let targetMouseX = window.innerWidth * 0.5;
  let targetMouseY = window.innerHeight * 0.5;
  let currentMouseX = targetMouseX;
  let currentMouseY = targetMouseY;

  let clickRipple = 0.0;
  let clickPosX = targetMouseX;
  let clickPosY = targetMouseY;

  function resize() {
    // ponytail: cap DPR at 1.25 to prevent fillrate saturation on Retina/4K screens (saves >60% pixels)
    dpr = Math.min(window.devicePixelRatio || 1, 1.25);
    winHeight = window.innerHeight;
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(winHeight * dpr);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
    }
  }
  window.addEventListener('resize', resize);
  resize();

  window.addEventListener('pointermove', (e) => {
    targetMouseX = e.clientX * dpr;
    targetMouseY = (winHeight - e.clientY) * dpr;
  });

  window.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.control-panel') || e.target.closest('.modal-card') || e.target.closest('.quick-dock') || e.target.closest('.toggle-panel-btn')) {
      return;
    }
    clickPosX = e.clientX * dpr;
    clickPosY = (winHeight - e.clientY) * dpr;
    clickRipple = 0.01;
  });

  // --- Main Animation Loop ---
  let startTime = performance.now();
  let lastFrameTime = performance.now();
  let isRendering = true;

  // ponytail: pause render loop when tab is hidden to reduce CPU/GPU/battery usage to 0%
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      isRendering = false;
    } else if (!isRendering) {
      isRendering = true;
      lastFrameTime = performance.now();
      requestAnimationFrame(render);
    }
  });

  function render(now) {
    if (!isRendering) return;

    // ponytail: throttle rendering to max 60fps on 120Hz/144Hz+ displays to conserve GPU
    if (now && now - lastFrameTime < 15.5) {
      requestAnimationFrame(render);
      return;
    }

    const currentTime = now || performance.now();
    const dt = Math.min((currentTime - lastFrameTime) / 1000, 0.1);
    lastFrameTime = currentTime;
    const elapsedTime = (currentTime - startTime) / 1000;

    currentMouseX += (targetMouseX - currentMouseX) * 0.09;
    currentMouseY += (targetMouseY - currentMouseY) * 0.09;

    if (clickRipple > 0.0) {
      clickRipple += dt * 1.5;
      if (clickRipple > 2.6) clickRipple = 0.0;
    }

    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform1f(uniforms.time, elapsedTime);
    gl.uniform2f(uniforms.mouse, currentMouseX, currentMouseY);
    gl.uniform1f(uniforms.scale, state.scale);
    gl.uniform1f(uniforms.speed, state.speed);
    gl.uniform1f(uniforms.bgSpeed, state.bgSpeed);
    gl.uniform1f(uniforms.thickness, state.thickness);
    gl.uniform1f(uniforms.depth, state.depth);
    gl.uniform1f(uniforms.mouseForce, state.mouseForce);
    gl.uniform1f(uniforms.mouseRadius, state.mouseRadius);
    gl.uniform1f(uniforms.clickRipple, clickRipple);
    gl.uniform2f(uniforms.clickPos, clickPosX, clickPosY);
    gl.uniform1i(uniforms.colorMode, state.colorMode);
    gl.uniform1i(uniforms.shapeMode, state.shapeMode);
    gl.uniform1f(uniforms.saturation, state.saturation);
    gl.uniform1f(uniforms.shadows, state.shadows);
    gl.uniform1f(uniforms.specular, state.specular);
    gl.uniform1i(uniforms.transparent, state.transparent ? 1 : 0);

    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  // --- UI & Controls Binding ---
  const sliders = {
    scale: document.getElementById('slider-scale'),
    speed: document.getElementById('slider-speed'),
    bgSpeed: document.getElementById('slider-bgSpeed'),
    thickness: document.getElementById('slider-thickness'),
    depth: document.getElementById('slider-depth'),
    mouseForce: document.getElementById('slider-mouseForce'),
    specular: document.getElementById('slider-specular'),
    shadows: document.getElementById('slider-shadows'),
    saturation: document.getElementById('slider-saturation')
  };

  const valLabels = {
    scale: document.getElementById('val-scale'),
    speed: document.getElementById('val-speed'),
    bgSpeed: document.getElementById('val-bgSpeed'),
    thickness: document.getElementById('val-thickness'),
    depth: document.getElementById('val-depth'),
    mouseForce: document.getElementById('val-mouseForce'),
    specular: document.getElementById('val-specular'),
    shadows: document.getElementById('val-shadows'),
    saturation: document.getElementById('val-saturation')
  };

  function updateUIFromState() {
    for (const key in sliders) {
      if (sliders[key] && state[key] !== undefined) {
        sliders[key].value = state[key];
        if (valLabels[key]) {
          valLabels[key].textContent = parseFloat(state[key]).toFixed(2);
        }
      }
    }
    document.querySelectorAll('.preset-btn').forEach((btn, idx) => {
      btn.classList.toggle('active', idx === state.colorMode);
    });
    document.querySelectorAll('.shape-btn').forEach((btn, idx) => {
      btn.classList.toggle('active', idx === state.shapeMode);
    });
  }

  for (const key in sliders) {
    if (sliders[key]) {
      sliders[key].addEventListener('input', (e) => {
        state[key] = parseFloat(e.target.value);
        if (valLabels[key]) valLabels[key].textContent = state[key].toFixed(2);
      });
    }
  }

  // Presets handling
  window.applyPreset = function (index) {
    if (PRESETS[index]) {
      Object.assign(state, PRESETS[index]);
      updateUIFromState();
      showToast(`Preset: ${PRESETS[index].name}`);
    }
  };

  // Shape modes handling
  window.setShapeMode = function (mode) {
    state.shapeMode = mode;
    if (SHAPES[mode]) {
      state.scale = SHAPES[mode].scale;
      state.thickness = SHAPES[mode].thickness;
    }
    updateUIFromState();
    showToast(`Forma: ${SHAPES[mode] ? SHAPES[mode].name : mode}`);
  };

  // Toggle control panel
  const panel = document.getElementById('control-panel');
  const toggleBtn = document.getElementById('toggle-panel-btn');
  const closePanelBtn = document.getElementById('close-panel-btn');

  function setPanelOpen(open) {
    panel.classList.toggle('collapsed', !open);
    toggleBtn.style.display = open ? 'none' : 'flex';
  }

  toggleBtn.addEventListener('click', () => setPanelOpen(true));
  closePanelBtn.addEventListener('click', () => setPanelOpen(false));

  // Toggle demo overlay
  const demoOverlay = document.getElementById('demo-overlay');
  const toggleDemoBtn = document.getElementById('toggle-demo-btn');
  let overlayVisible = true;

  function toggleOverlay() {
    overlayVisible = !overlayVisible;
    demoOverlay.classList.toggle('hidden', !overlayVisible);
    if (toggleDemoBtn) {
      toggleDemoBtn.classList.toggle('active', overlayVisible);
    }
    showToast(overlayVisible ? 'Vista previa activada' : 'Fondo limpio');
  }

  if (toggleDemoBtn) {
    toggleDemoBtn.addEventListener('click', toggleOverlay);
  }

  // Keyboard shortcuts (1 to 7 for shapes)
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (e.key === 'h' || e.key === 'H') {
      const isCollapsed = panel.classList.contains('collapsed');
      setPanelOpen(isCollapsed);
    } else if (e.code === 'Space') {
      e.preventDefault();
      toggleOverlay();
    } else if (e.key === 'f' || e.key === 'F') {
      toggleFullscreen();
    } else if (e.key >= '1' && e.key <= '7') {
      const modeIdx = parseInt(e.key, 10) - 1;
      setShapeMode(modeIdx);
    }
  });

  // Fullscreen toggle
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  }
  const fullscreenBtn = document.getElementById('fullscreen-btn');
  if (fullscreenBtn) fullscreenBtn.addEventListener('click', toggleFullscreen);

  // Toast notification
  const toast = document.getElementById('toast');
  let toastTimer = null;
  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  // --- Export Modal & Code Generator ---
  const modalBackdrop = document.getElementById('export-modal');
  const openExportBtn = document.getElementById('open-export-btn');
  const closeExportBtn = document.getElementById('close-export-btn');
  const codePre = document.getElementById('export-code');
  const copyCodeBtn = document.getElementById('copy-code-btn');

  function getSnippet(tab) {
    if (tab === 'obs') {
      const q = new URLSearchParams();
      if (state.shapeMode !== 0) q.set('shape', state.shapeMode);
      if (state.colorMode !== 0) q.set('preset', state.colorMode);
      if (Math.abs(state.scale - 44.0) > 0.1) q.set('scale', state.scale.toFixed(1));
      if (Math.abs(state.speed - 0.75) > 0.05) q.set('speed', state.speed.toFixed(2));
      if (Math.abs(state.bgSpeed - 1.0) > 0.05) q.set('bgSpeed', state.bgSpeed.toFixed(2));
      if (Math.abs(state.thickness - 0.52) > 0.02) q.set('thickness', state.thickness.toFixed(2));
      if (Math.abs(state.depth - 1.6) > 0.1) q.set('depth', state.depth.toFixed(1));
      if (Math.abs(state.saturation - 1.0) > 0.1) q.set('saturation', state.saturation.toFixed(1));
      if (state.transparent) q.set('transparent', '1');

      const queryString = q.toString() ? `?${q.toString()}` : '';
      const fullUrl = `obs.html${queryString}`;

      return `<!-- ============================================ -->
<!-- 🎥 CONFIGURACIÓN PARA OBS STUDIO (Browser Source) -->
<!-- ============================================ -->

1. En OBS Studio, ve al panel "Fuentes" (+) y añade:
   -> "Navegador" (Browser Source)

2. Configuración recomendada:
   • Archivo local: [x] Activado -> Selecciona: obs.html
     (O pega la URL: ${fullUrl})
   • Ancho:  1920
   • Alto:   1080
   • FPS:    60 (o 30 si deseas menor consumo)
   • CSS personalizado: Dejar por defecto (body { background-color: rgba(0,0,0,0); margin: 0; })
   • Apagar fuente cuando no esté visible: [x] Recomendado

3. URL con tus parámetros actuales:
   ${fullUrl}

4. Parámetros útiles que puedes añadir a la URL:
   • &transparent=1   -> Fondo 100% transparente (solo cordones 3D sobre tu cámara o juego)
   • &shape=5         -> Cambia forma (0: Tréboles, 1: Cebra, 2: Coral, 3: Ondas, 4: Gotas, 5: Corazones, 6: Huesos)
   • &preset=2        -> Cambia estilo (0: Pastel, 1: Zebra, 2: Cotton, 3: Coral, 4: Neon, 5: Golden)
   • &fps=30          -> Limita a 30 FPS para ahorrar GPU
   • &auto=0          -> Desactiva movimiento virtual autónomo

5. Atajos rápidos en vivo (Clic derecho en OBS -> Interactuar):
   • Teclas 1 a 7 : Cambia de forma al instante
   • Tecla P      : Siguiente preset de color
   • Tecla T      : Alterna fondo transparente / pastel
   • Tecla A      : Alterna movimiento autónomo
   • Tecla R      : Dispara onda líquida expansiva`;
    }

    if (tab === 'threejs') {
      return `import * as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'default' });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
document.body.appendChild(renderer.domElement);

const material = new THREE.RawShaderMaterial({
  glslVersion: THREE.GLSL3,
  vertexShader: \`${VERTEX_SHADER_SOURCE.replace(/`/g, '\\`')}\`,
  fragmentShader: \`${FRAGMENT_SHADER_SOURCE.replace(/`/g, '\\`')}\`,
  uniforms: {
    u_resolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    u_time: { value: 0 },
    u_mouse: { value: new THREE.Vector2(0, 0) },
    u_scale: { value: ${state.scale.toFixed(1)} },
    u_speed: { value: ${state.speed.toFixed(1)} },
    u_bgSpeed: { value: ${state.bgSpeed.toFixed(1)} },
    u_thickness: { value: ${state.thickness.toFixed(2)} },
    u_depth: { value: ${state.depth.toFixed(1)} },
    u_mouseForce: { value: ${state.mouseForce.toFixed(2)} },
    u_mouseRadius: { value: ${state.mouseRadius.toFixed(1)} },
    u_clickRipple: { value: 0 },
    u_clickPos: { value: new THREE.Vector2(0, 0) },
    u_colorMode: { value: ${state.colorMode} },
    u_shapeMode: { value: ${state.shapeMode} },
    u_saturation: { value: ${state.saturation.toFixed(1)} },
    u_shadows: { value: ${state.shadows.toFixed(2)} },
    u_specular: { value: ${state.specular.toFixed(2)} },
    u_transparent: { value: ${state.transparent ? 1 : 0} }
  },
  depthWrite: false,
  depthTest: false
});

const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
scene.add(quad);

function animate(time) {
  material.uniforms.u_time.value = time * 0.001;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);`;
    }

    if (tab === 'glsl') {
      return FRAGMENT_SHADER_SOURCE;
    }

    return `<!-- Drop-in Background: Animal Print 3D WebGL Multi-Shape (7 Formas) -->
<canvas id="shader-bg" style="position:fixed;top:0;left:0;width:100vw;height:100vh;z-index:-1;pointer-events:none;"></canvas>
<script>
(function() {
  const c = document.getElementById('shader-bg');
  const gl = c.getContext('webgl2', { alpha: false });
  if(!gl) return;
  const vs = \`#version 300 es
  in vec2 p; out vec2 v; void main(){ v=(p+1.)*.5; gl_Position=vec4(p,0,1); }\`;
  const fs = \`${FRAGMENT_SHADER_SOURCE.replace(/`/g, '\\`')}\`;
  function cs(t,s){ const sh=gl.createShader(t); gl.shaderSource(sh,s); gl.compileShader(sh); return sh; }
  const pr = gl.createProgram();
  gl.attachShader(pr, cs(gl.VERTEX_SHADER, vs));
  gl.attachShader(pr, cs(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(pr); gl.useProgram(pr);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
  const pLoc = gl.getAttribLocation(pr, 'p');
  gl.enableVertexAttribArray(pLoc); gl.vertexAttribPointer(pLoc, 2, gl.FLOAT, false, 0, 0);
  
  function res(){ const dpr = Math.min(window.devicePixelRatio||1, 1.25); c.width = window.innerWidth * dpr; c.height = window.innerHeight * dpr; gl.viewport(0,0,c.width,c.height); }
  window.addEventListener('resize', res); res();
  
  const uRes = gl.getUniformLocation(pr, 'u_resolution');
  const uTime = gl.getUniformLocation(pr, 'u_time');
  const uMouse = gl.getUniformLocation(pr, 'u_mouse');
  gl.uniform1f(gl.getUniformLocation(pr, 'u_scale'), ${state.scale.toFixed(1)});
  gl.uniform1f(gl.getUniformLocation(pr, 'u_speed'), ${state.speed.toFixed(1)});
  gl.uniform1f(gl.getUniformLocation(pr, 'u_bgSpeed'), ${state.bgSpeed.toFixed(1)});
  gl.uniform1f(gl.getUniformLocation(pr, 'u_thickness'), ${state.thickness.toFixed(2)});
  gl.uniform1f(gl.getUniformLocation(pr, 'u_depth'), ${state.depth.toFixed(1)});
  gl.uniform1f(gl.getUniformLocation(pr, 'u_mouseForce'), ${state.mouseForce.toFixed(2)});
  gl.uniform1f(gl.getUniformLocation(pr, 'u_mouseRadius'), ${state.mouseRadius.toFixed(1)});
  gl.uniform1i(gl.getUniformLocation(pr, 'u_colorMode'), ${state.colorMode});
  gl.uniform1i(gl.getUniformLocation(pr, 'u_shapeMode'), ${state.shapeMode});
  gl.uniform1f(gl.getUniformLocation(pr, 'u_saturation'), ${state.saturation.toFixed(1)});
  gl.uniform1f(gl.getUniformLocation(pr, 'u_shadows'), ${state.shadows.toFixed(2)});
  gl.uniform1f(gl.getUniformLocation(pr, 'u_specular'), ${state.specular.toFixed(2)});
  gl.uniform1i(gl.getUniformLocation(pr, 'u_transparent'), ${state.transparent ? 1 : 0});
  
  let mx = c.width*0.5, my = c.height*0.5;
  window.addEventListener('pointermove', e => { const dpr = Math.min(window.devicePixelRatio||1, 1.25); mx = e.clientX*dpr; my = (window.innerHeight - e.clientY)*dpr; });
  let t0 = performance.now();
  function loop(){
    gl.uniform2f(uRes, c.width, c.height);
    gl.uniform1f(uTime, (performance.now()-t0)/1000);
    gl.uniform2f(uMouse, mx, my);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
</script>`;
  }

  let currentTab = 'html';

  function updateSnippetDisplay() {
    if (codePre) {
      codePre.textContent = getSnippet(currentTab);
    }
  }

  window.setExportTab = function (tab) {
    currentTab = tab;
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    updateSnippetDisplay();
  };

  if (openExportBtn) {
    openExportBtn.addEventListener('click', () => {
      updateSnippetDisplay();
      modalBackdrop.classList.add('active');
    });
  }

  if (closeExportBtn) {
    closeExportBtn.addEventListener('click', () => {
      modalBackdrop.classList.remove('active');
    });
  }

  modalBackdrop.addEventListener('click', (e) => {
    if (e.target === modalBackdrop) {
      modalBackdrop.classList.remove('active');
    }
  });

  if (copyCodeBtn) {
    copyCodeBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(getSnippet(currentTab)).then(() => {
        showToast('¡Copiado al portapapeles!');
      }).catch(() => {
        showToast('Error al copiar. Selecciona y copia manualmente.');
      });
    });
  }

  updateUIFromState();
})();
