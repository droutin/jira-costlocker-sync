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
      v-if="syncSummary && syncSummary.failed === 0 && syncSummary.skipped === 0"
      color="success"
      title="Sync Complete"
      :description="`All ${syncSummary.succeeded} worklogs synced successfully.`"
    />

    <UAlert
      v-if="syncSummary && (syncSummary.failed > 0 || syncSummary.skipped > 0)"
      :color="syncSummary.failed > 0 ? 'warning' : 'info'"
      title="Sync Complete"
      :description="syncSummaryText"
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
          <UBadge :color="r.success ? 'success' : r.skipped ? 'warning' : 'error'">
            {{ r.success ? 'OK' : r.skipped ? 'SKIP' : 'FAIL' }}
          </UBadge>
          <span>{{ getWorklogLabel(r.worklogId) }}</span>
          <span v-if="r.skipped" class="text-sm text-dimmed">Already in Costlocker</span>
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
const syncSummary = ref<{ succeeded: number; failed: number; skipped: number; errors: Array<{ worklogId: string; error: string }> } | null>(null)

const hasUnsyncedEntries = computed(() => worklogs.value.some(w => w.syncStatus === 'pending'))

const syncSummaryText = computed(() => {
  if (!syncSummary.value) return ''
  const parts: string[] = []
  if (syncSummary.value.succeeded) parts.push(`${syncSummary.value.succeeded} synced`)
  if (syncSummary.value.skipped) parts.push(`${syncSummary.value.skipped} skipped (already in Costlocker)`)
  if (syncSummary.value.failed) parts.push(`${syncSummary.value.failed} failed`)
  return parts.join(', ')
})

const columns = [
  { accessorKey: 'date', header: 'Date', meta: { class: { td: 'max-w-20 truncate' } } },
  { accessorKey: 'jiraIssueKey', header: 'Issue', meta: { class: { td: 'max-w-20 truncate' } } },
  { accessorKey: 'jiraIssueSummary', header: 'Summary', meta: { class: { td: 'max-w-60 truncate' } } },
  { accessorKey: 'description', header: 'Description', meta: { class: { td: 'max-w-48 truncate' } } },
  {
    accessorKey: 'startTime',
    header: 'Start',
    cell: ({ row }: any) => formatTime(row.original.startTime),
    meta: { class: { td: 'max-w-16 truncate' } },
  },
  {
    id: 'endTime',
    header: 'End',
    cell: ({ row }: any) => formatEndTime(row.original),
    meta: { class: { td: 'max-w-16 truncate' } },
  },
  {
    accessorKey: 'durationSeconds',
    header: 'Duration',
    cell: ({ row }: any) => formatDuration(row.original.durationSeconds),
    meta: { class: { td: 'max-w-16 truncate' } },
  },
  { accessorKey: 'costlockerBudgetId', header: 'CL Budget', meta: { class: { td: 'max-w-16 truncate' } } },
  { accessorKey: 'syncStatus', header: 'Status', meta: { class: { td: 'max-w-16 truncate' } } },
]

function formatTime(isoOrDate: string): string {
  if (!isoOrDate) return '—'
  const d = new Date(isoOrDate)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function formatEndTime(row: WorklogEntry): string {
  if (!row.startTime) return '—'
  const d = new Date(row.startTime)
  if (Number.isNaN(d.getTime())) return '—'
  const end = new Date(d.getTime() + row.durationSeconds * 1000)
  return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
}

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
    const res = await $fetch<{ results: SyncResult[]; succeeded: number; failed: number; skipped: number; errors: Array<{ worklogId: string; error: string }> }>('/api/sync', {
      method: 'POST',
      body: {
        worklogs: toSync,
      },
      headers: authHeaders(),
    })

    syncResults.value = res.results
    syncSummary.value = { succeeded: res.succeeded, failed: res.failed, skipped: res.skipped, errors: res.errors }

    for (const r of res.results) {
      const wl = worklogs.value.find(w => w.id === r.worklogId)
      if (wl) {
        wl.syncStatus = r.success ? 'synced' : r.skipped ? 'skipped' : 'error'
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
