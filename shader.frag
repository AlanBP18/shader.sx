#version 300 es
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
uniform int u_shapeMode; // 0: Tréboles, 1: Cebra, 2: Coral, 3: Ondas, 4: Gotas, 5: Corazones, 6: Huesos
uniform float u_saturation;
uniform float u_shadows;
uniform float u_specular;
uniform int u_transparent;

// Isometric 3D rotation matrix aligning with body diagonal (1, 1, 1) -> 3-fold trefoil clovers
const mat3 R_DIAG = mat3(
    0.70710678, -0.70710678, 0.0,
    0.40824829,  0.40824829, -0.81649658,
    0.57735027,  0.57735027,  0.57735027
);

// Non-symmetric rotation matrix for continuous winding zebra print
const mat3 R_ZEBRA = mat3(
    0.8528685, -0.4770304,  0.2131972,
    0.3894183,  0.8466101,  0.3625385,
   -0.3474937, -0.2370356,  0.9071539
);

// Precalculated static vectors to avoid per-pixel normalize()
const vec3 LIGHT_DIR = vec3(-0.4137065, 0.5641453, 0.714584); // normalize(vec3(-0.55, 0.75, 0.95))
const vec3 HALF_VEC = vec3(-0.2234057, 0.3046441, 0.925893);  // normalize(LIGHT_DIR + vec3(0.0, 0.0, 1.0))
const vec2 SHADOW_DIR = vec2(0.591361, -0.806401);           // normalize(vec2(0.55, -0.75))

// Cosine color palette generator
vec3 cosPalette(float t, vec3 a, vec3 b, vec3 c, vec3 d) {
    return a + b * cos(6.2831853 * (c * t + d));
}

// Polynomial smooth minimum for organic merging
float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
}

float dot2(in vec2 v) { return dot(v, v); }

// Iconic, plump, centered 2D Heart SDF (continuous solid)
float sdHeart(vec2 p) {
    p.y += 0.48;
    p.x = abs(p.x);
    if (p.y + p.x > 1.0)
        return sqrt(dot2(p - vec2(0.25, 0.75))) - 0.35355339;
    return sqrt(min(dot2(p - vec2(0.00, 1.00)),
                    dot2(p - 0.5 * max(p.x + p.y, 0.0)))) * sign(p.x - p.y);
}

// Iconic, chunky cartoon Dog Bone SDF (narrow waist + 4 rounded bulging knuckles)
float sdBone(vec2 p) {
    p = abs(p);
    float dKnuckle = length(p - vec2(0.34, 0.16)) - 0.16;
    float dx = max(0.0, p.x - 0.30);
    float dShaft = length(vec2(dx, p.y)) - 0.10;
    return smin(dKnuckle, dShaft, 0.12);
}

// Evaluate continuous procedural scalar field for all 7 organic shapes
float evalG(vec2 uv, float t) {
    // Mouse displacement distortion (viscous elastic pull/push)
    vec2 mPos = (u_mouse - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y) * u_scale;
    vec2 dM = uv - mPos;
    float dMLen = length(dM);
    float mRad = u_mouseRadius * 3.5;
    float mInfluence = exp(-dMLen * dMLen / max(0.01, mRad * mRad)) * u_mouseForce * 2.2;
    uv -= normalize(dM + 1e-4) * mInfluence;

    // Interactive click ripple wave
    if (u_clickRipple > 0.0 && u_clickRipple < 2.5) {
        vec2 cPos = (u_clickPos - 0.5 * u_resolution) / min(u_resolution.x, u_resolution.y) * u_scale;
        vec2 dC = uv - cPos;
        float dCLen = length(dC);
        float wave = sin(dCLen * 0.8 - u_clickRipple * 9.0) * exp(-u_clickRipple * 1.5) * exp(-dCLen * 0.08);
        uv += normalize(dC + 1e-4) * wave * 2.0;
    }

    if (u_shapeMode == 0) {
        // --- 0: Tréboles 3D (Triskelion / Trefoils) ---
        vec2 warp0 = vec2(sin(uv.y * 0.075 + t * 0.12), cos(uv.x * 0.075 + t * 0.10)) * 2.2;
        vec2 pos = uv + warp0;
        vec3 p = R_DIAG * vec3(pos, t * u_speed * 0.40);
        float g = sin(p.x) * cos(p.y) + sin(p.y) * cos(p.z) + sin(p.z) * cos(p.x);
        float term = sin(pos.x * 0.06 + t * 0.06) * cos(pos.y * 0.06 - t * 0.05);
        return g + term * 0.18;

    } else if (u_shapeMode == 1) {
        // --- 1: Cebra / Laberinto Continuo (Zebra Meander) ---
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
        // --- 2: Coral / Células Biomórficas ---
        vec2 p = uv * 0.26;
        vec2 warp2 = vec2(sin(p.y * 0.9 + t * 0.16), cos(p.x * 0.9 + t * 0.13)) * 0.9;
        p += warp2;
        float c1 = cos(p.x + t * u_speed * 0.26);
        float c2 = cos(-0.5 * p.x + 0.866025 * p.y + t * u_speed * 0.23);
        float c3 = cos(-0.5 * p.x - 0.866025 * p.y - t * u_speed * 0.20);
        return (c1 * c2 + c2 * c3 + c3 * c1) + 0.48;

    } else if (u_shapeMode == 3) {
        // --- 3: Ondas & Cintas Líquidas ---
        vec2 p = uv * 0.28;
        float waveWarp = sin(p.x * 0.45 + p.y * 0.3 + t * 0.18) * 1.6;
        return sin(p.y * 1.25 + waveWarp + t * u_speed * 0.52) 
             + 0.52 * sin(p.x * 0.85 - p.y * 0.65 - t * u_speed * 0.38)
             + 0.28 * cos(p.x * 1.4 + t * 0.22);

    } else if (u_shapeMode == 4) {
        // --- 4: Gotas & Bio-Perlas ---
        vec2 p = uv * 0.22;
        vec2 warp4 = vec2(sin(p.y * 0.95 + t * 0.2), cos(p.x * 0.95 - t * 0.18)) * 1.3;
        p += warp4;
        return sin(p.x * 1.15) * cos(p.y * 1.15) 
             + cos(p.x * 0.72 - t * u_speed * 0.32) * sin(p.y * 0.72 + t * u_speed * 0.28) - 0.32;

    } else if (u_shapeMode == 5) {
        // --- 5: Corazones 3D Puffy & Rellenos (Solid 3D Puffy Clay Hearts ❤️) ---
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
                
                // Movimiento orgánico flotante
                vec2 center = g + vec2(
                    sin(t * 0.35 * u_speed + h1 * 6.28),
                    cos(t * 0.30 * u_speed + h2 * 6.28)
                ) * 0.28;
                vec2 localP = f - center;

                // Pulsación suave y balanceo natural
                float beat = 1.0 + 0.08 * sin(t * 3.0 * u_speed + h1 * 5.0);
                float ang = sin(t * 0.22 * u_speed + h1 * 4.0) * 0.32 + h2 * 0.45;
                float cosA = cos(ang), sinA = sin(ang);
                vec2 rotP = vec2(localP.x * cosA - localP.y * sinA, localP.x * sinA + localP.y * cosA);

                // Corazón sólido, lleno y redondeado
                float d = sdHeart(rotP / (0.52 * beat)) * (0.52 * beat);
                minDist = smin(minDist, d, 0.16);
            }
        }
        return minDist;

    } else {
        // --- 6: Huesos de Perro 3D Puffy & Rellenos (Solid 3D Chunky Dog Bones 🦴) ---
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
                
                // Movimiento orgánico flotante
                vec2 center = g + vec2(
                    sin(t * 0.32 * u_speed + h1 * 6.28),
                    cos(t * 0.28 * u_speed + h2 * 6.28)
                ) * 0.26;
                vec2 localP = f - center;

                // Rotaciones diversas en 360 grados
                float ang = h1 * 3.14 + t * 0.20 * u_speed * (h2 > 0.0 ? 1.0 : -1.0);
                float cosA = cos(ang), sinA = sin(ang);
                vec2 rotP = vec2(localP.x * cosA - localP.y * sinA, localP.x * sinA + localP.y * cosA);

                // Hueso de perro relleno y sólido con nódulos redondos
                float d = sdBone(rotP / 0.52) * 0.52;
                minDist = smin(minDist, d, 0.16);
            }
        }
        return minDist;
    }
}

// Compute surface height: smooth tubular cords (modes 0-4) or solid puffy clay 3D objects (modes 5-6)
float getHeight(vec2 uv, float t) {
    if (u_shapeMode >= 5) {
        // Formas Sólidas 3D Rellenas (Corazones y Huesos): sin huecos ni hendiduras internas
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

// Background: Moving Rainbow Swirl + Diagonal Moving Gradient Sweep
vec3 getPastelSwirlWithDiagonalGradient(vec2 p, float t) {
    float bgT = t * u_bgSpeed;

    vec2 pNorm = p * 0.07;

    // 1. Rainbow Swirl (Remolino Arcoíris en movimiento)
    vec2 center = vec2(sin(bgT * 0.22) * 1.2, cos(bgT * 0.18) * 0.9);
    vec2 d = pNorm - center;
    float r = length(d);
    float angle = atan(d.y, d.x);

    // Ecuación de remolino
    float swirlAngle = angle + (3.8 / (r * 0.35 + 0.85)) + bgT * 0.45;
    
    // Fase de la espiral multicapa
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

// Preset color management
void getColorTheme(vec2 p, float t, out vec3 tubeColor, out vec3 bgColor, out vec3 lightTint) {
    if (u_colorMode == 0) {
        // Pastel Clay (Referencia con remolino arcoíris + gradiente diagonal)
        tubeColor = vec3(0.965, 0.965, 0.975);
        bgColor = getPastelSwirlWithDiagonalGradient(p, t);
        lightTint = vec3(1.0, 0.98, 0.96);
    } else if (u_colorMode == 1) {
        // Zebra Minimal (Sculptural Monochrome)
        tubeColor = vec3(0.95, 0.95, 0.96);
        float diagCoord = (p.x * 0.7071 + p.y * 0.7071) * 0.08 - t * u_bgSpeed * 0.5;
        float darkWave = sin(diagCoord * 2.0) * 0.05;
        bgColor = vec3(0.11 + darkWave, 0.11 + darkWave, 0.13 + darkWave);
        lightTint = vec3(1.0, 1.0, 1.0);
    } else if (u_colorMode == 2) {
        // Cotton Candy Swirl
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
        // Coral Reef
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
        // Cyber Neon
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
        // Golden Pearl
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
}
