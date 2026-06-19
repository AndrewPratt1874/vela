<template>
  <div
    class="relative min-h-screen flex items-center justify-center p-6 overflow-hidden"
    style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #0f172a 100%)"
  >
    <!-- Animated Vela constellation (softened into the background) -->
    <div class="absolute inset-0 opacity-50 blur-[3px]">
      <ConstellationBackground />
    </div>

    <!-- Brand glow accents -->
    <div
      class="absolute inset-0 pointer-events-none"
      style="background: radial-gradient(ellipse at top right, rgba(0, 174, 239, 0.15) 0%, transparent 50%)"
    />
    <div
      class="absolute inset-0 pointer-events-none"
      style="background: radial-gradient(ellipse at bottom left, rgba(0, 174, 239, 0.1) 0%, transparent 50%)"
    />

    <div class="w-full max-w-sm relative z-10">
      <slot />
    </div>
  </div>
</template>
