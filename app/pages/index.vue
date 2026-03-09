<template>
  <div class="space-y-6">
    <!-- Date Range -->
    <UCard>
      <div class="flex items-end gap-4">
        <UFormField label="From">
          <UInput v-model="dateFrom" type="date" />
        </UFormField>
        <UFormField label="To">
          <UInput v-model="dateTo" type="date" />
        </UFormField>
        <UButton :loading="fetching" @click="fetchWorklogs">
          Fetch worklogs
        </UButton>
      </div>
    </UCard>

    <!-- Error -->
    <UAlert v-if="fetchError" color="error" title="Error" :description="fetchError" />

    <!-- Worklogs Table -->
    <UCard v-if="worklogs.length">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-semibold">{{ worklogs.length }} worklogs found</span>
          <UButton :loading="syncing" :disabled="!hasUnsyncedEntries" @click="syncWorklogs">
            Sync to Costlocker
          </UButton>
        </div>
      </template>

      <UTable :data="worklogs" :columns="columns" />
    </UCard>

    <!-- Sync Summary -->
    <UAlert
      v-if="syncSummary && syncSummary.failed === 0"
      color="success"
      title="Sync Complete"
      :description="`All ${syncSummary.succeeded} worklogs synced successfully.`"
    />

    <UAlert
      v-if="syncSummary && syncSummary.failed > 0"
      color="warning"
      title="Sync Complete"
      :description="`${syncSummary.succeeded} succeeded, ${syncSummary.failed} failed.`"
    />

    <!-- Sync Errors -->
    <UCard v-if="syncSummary && syncSummary.errors.length">
      <template #header>
        <span class="font-semibold text-red-500">Sync Errors</span>
      </template>
      <div class="space-y-2">
        <div v-for="e in syncSummary.errors" :key="e.worklogId" class="flex items-center gap-2">
          <UBadge color="error">FAIL</UBadge>
          <span class="font-medium">{{ getWorklogLabel(e.worklogId) }}</span>
          <span class="text-sm text-red-500">{{ e.error }}</span>
        </div>
      </div>
    </UCard>

    <!-- Sync Results (per entry) -->
    <UCard v-if="syncResults.length">
      <template #header>
        <span class="font-semibold">Sync Details</span>
      </template>
      <div class="space-y-2">
        <div v-for="r in syncResults" :key="r.worklogId" class="flex items-center gap-2">
          <UBadge :color="r.success ? 'success' : 'error'">
            {{ r.success ? 'OK' : 'FAIL' }}
          </UBadge>
          <span>{{ getWorklogLabel(r.worklogId) }}</span>
        </div>
      </div>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { WorklogEntry, SyncResult } from '~/types'

const { load, authHeaders, applyMappings } = useConfig()

const today = new Date().toISOString().substring(0, 10)
const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().substring(0, 10)

const dateFrom = ref(weekAgo)
const dateTo = ref(today)
const worklogs = ref<WorklogEntry[]>([])
const fetching = ref(false)
const fetchError = ref('')
const syncing = ref(false)
const syncResults = ref<SyncResult[]>([])
const syncSummary = ref<{ succeeded: number; failed: number; errors: Array<{ worklogId: string; error: string }> } | null>(null)

const hasUnsyncedEntries = computed(() => worklogs.value.some(w => w.syncStatus === 'pending'))

const columns = [
  { accessorKey: 'date', header: 'Date' },
  { accessorKey: 'jiraIssueKey', header: 'Issue' },
  { accessorKey: 'jiraIssueSummary', header: 'Summary' },
  { accessorKey: 'description', header: 'Description' },
  {
    accessorKey: 'durationSeconds',
    header: 'Duration',
    cell: ({ row }: any) => formatDuration(row.original.durationSeconds),
  },
  { accessorKey: 'costlockerBudgetId', header: 'CL Budget' },
  { accessorKey: 'syncStatus', header: 'Status' },
]

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.round((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

function getWorklogLabel(id: string): string {
  const wl = worklogs.value.find(w => w.id === id)
  return wl ? `${wl.jiraIssueKey} (${wl.date})` : id
}

async function fetchWorklogs() {
  fetching.value = true
  fetchError.value = ''
  syncResults.value = []

  try {
    worklogs.value = await $fetch<WorklogEntry[]>('/api/worklogs', {
      query: { from: dateFrom.value, to: dateTo.value },
      headers: authHeaders(),
    })
    applyMappings(worklogs.value)
  }
  catch (err: any) {
    fetchError.value = err.data?.message || err.message || 'Failed to fetch worklogs'
  }
  finally {
    fetching.value = false
  }
}

async function syncWorklogs() {
  syncing.value = true
  syncResults.value = []
  syncSummary.value = null

  const toSync = worklogs.value.filter(w => w.syncStatus === 'pending')

  try {
    const res = await $fetch<{ results: SyncResult[]; succeeded: number; failed: number; errors: Array<{ worklogId: string; error: string }> }>('/api/sync', {
      method: 'POST',
      body: { worklogs: toSync },
      headers: authHeaders(),
    })

    syncResults.value = res.results
    syncSummary.value = { succeeded: res.succeeded, failed: res.failed, errors: res.errors }

    for (const r of res.results) {
      const wl = worklogs.value.find(w => w.id === r.worklogId)
      if (wl) {
        wl.syncStatus = r.success ? 'synced' : 'error'
        wl.syncError = r.error
      }
    }
  }
  catch (err: any) {
    fetchError.value = err.data?.message || err.message || 'Sync failed'
  }
  finally {
    syncing.value = false
  }
}

onMounted(() => {
  load()
})
</script>
