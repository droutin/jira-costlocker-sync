<template>
  <UApp>
    <NuxtRouteAnnouncer />
    <UContainer class="py-8">
      <div class="flex items-center justify-between mb-8">
        <h1 class="text-2xl font-bold">Jira → Costlocker Sync</h1>
        <UNavigationMenu :items="navItems" />
      </div>
      <NuxtPage />
    </UContainer>
  </UApp>
</template>

<script setup lang="ts">
const navItems = [
  { label: 'Sync', to: '/' },
  { label: 'Settings', to: '/settings' },
]
</script>
