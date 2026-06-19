<script setup lang="ts">
import { ref, onMounted } from 'vue'

// Vela ("the Sails") — stars arranged into a recognisable sail/kite shape.
// Positions are normalised to the 0–100 SVG viewBox, tuned for backdrop aesthetics.
const stars = [
  { id: 'gamma', x: 18, y: 22, size: 2.5, brightness: 1 },    // γ Velorum (Regor) — brightest
  { id: 'delta', x: 40, y: 15, size: 2, brightness: 0.85 },   // δ Velorum
  { id: 'kappa', x: 68, y: 22, size: 1.8, brightness: 0.8 },  // κ Velorum (Markeb)
  { id: 'lambda', x: 82, y: 45, size: 2.2, brightness: 0.9 }, // λ Velorum (Suhail)
  { id: 'mu', x: 70, y: 70, size: 1.6, brightness: 0.7 },     // μ Velorum
  { id: 'phi', x: 45, y: 78, size: 1.5, brightness: 0.65 },   // φ Velorum
  { id: 'psi', x: 22, y: 55, size: 1.7, brightness: 0.75 },   // ψ Velorum
]

// Connections forming the sail outline plus a couple of internal lines.
const connections: [string, string][] = [
  ['gamma', 'delta'],
  ['delta', 'kappa'],
  ['kappa', 'lambda'],
  ['lambda', 'mu'],
  ['mu', 'phi'],
  ['phi', 'psi'],
  ['psi', 'gamma'],
  ['delta', 'psi'], // internal
  ['kappa', 'mu'], // internal
]

const backgroundStars = ref<Array<{ x: number; y: number; size: number; delay: number }>>([])
const twinkleOffsets = ref<Record<string, number>>({})

onMounted(() => {
  backgroundStars.value = Array.from({ length: 120 }, () => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    size: Math.random() * 1.2 + 0.3,
    delay: Math.random() * 8,
  }))
  stars.forEach((star) => {
    twinkleOffsets.value[star.id] = Math.random() * 6
  })
})

function getStarById(id: string) {
  return stars.find((s) => s.id === id)
}
</script>

<template>
  <div class="absolute inset-0 overflow-hidden pointer-events-none">
    <svg
      class="w-full h-full"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <filter id="velaStarGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="0.5" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="velaLineGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="0.3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <radialGradient id="velaStarGradient">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="50%" stop-color="#00AEEF" />
          <stop offset="100%" stop-color="transparent" />
        </radialGradient>
      </defs>

      <!-- Atmospheric background stars -->
      <g>
        <circle
          v-for="(star, index) in backgroundStars"
          :key="`bg-${index}`"
          :cx="star.x"
          :cy="star.y"
          :r="star.size * 0.3"
          fill="#ffffff"
          opacity="0.3"
          class="twinkle-star"
          :style="{ animationDelay: `${star.delay}s` }"
        />
      </g>

      <!-- Constellation connections -->
      <g filter="url(#velaLineGlow)">
        <line
          v-for="(connection, index) in connections"
          :key="`line-${index}`"
          :x1="getStarById(connection[0])?.x"
          :y1="getStarById(connection[0])?.y"
          :x2="getStarById(connection[1])?.x"
          :y2="getStarById(connection[1])?.y"
          stroke="#00AEEF"
          stroke-width="0.15"
          stroke-opacity="0.4"
          class="constellation-line"
          :style="{ animationDelay: `${index * 0.3}s` }"
        />
      </g>

      <!-- Constellation stars -->
      <g filter="url(#velaStarGlow)">
        <g v-for="star in stars" :key="star.id" class="star-group">
          <circle
            :cx="star.x"
            :cy="star.y"
            :r="star.size * 1.5"
            fill="url(#velaStarGradient)"
            :opacity="star.brightness * 0.3"
            class="star-glow"
            :style="{ animationDelay: `${twinkleOffsets[star.id] || 0}s` }"
          />
          <circle
            :cx="star.x"
            :cy="star.y"
            :r="star.size * 0.5"
            fill="#ffffff"
            :opacity="star.brightness"
            class="star-core"
            :style="{ animationDelay: `${(twinkleOffsets[star.id] || 0) + 0.5}s` }"
          />
        </g>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.twinkle-star {
  animation: twinkle 8s ease-in-out infinite;
}
.constellation-line {
  animation: linePulse 12s ease-in-out infinite;
}
.star-glow {
  animation: starPulse 10s ease-in-out infinite;
}
.star-core {
  animation: starTwinkle 9s ease-in-out infinite;
}
.star-group {
  animation: float 22s ease-in-out infinite;
}

@keyframes twinkle {
  0%, 100% { opacity: 0.25; }
  50% { opacity: 0.45; }
}
@keyframes linePulse {
  0%, 100% { stroke-opacity: 0.25; }
  50% { stroke-opacity: 0.45; }
}
@keyframes starPulse {
  0%, 100% { opacity: 0.25; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(1.03); }
}
@keyframes starTwinkle {
  0%, 100% { opacity: 0.8; }
  50% { opacity: 1; }
}
@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-0.25px); }
}

@media (prefers-reduced-motion: reduce) {
  .twinkle-star,
  .constellation-line,
  .star-glow,
  .star-core,
  .star-group {
    animation: none;
  }
}
</style>
