<template>
  <div class="space-y-6">
    <!-- API Configuration -->
    <UCard>
      <template #header>
        <span class="font-semibold">API Configuration</span>
      </template>
      <div class="space-y-4">
        <UFormField label="STAGIL Timetracker API Token" hint="Timetracker > My Preferences > REST API tab">
          <UInput v-model="config.jiraApiToken" type="password" placeholder="Your API token" />
        </UFormField>
        <UFormField label="Jira Account ID" hint="Your Jira profile URL contains this ID">
          <UInput v-model="config.jiraAccountId" placeholder="e.g. 5f1234abc567de0012345678" />
        </UFormField>
        <UFormField label="Costlocker API Token">
          <UInput v-model="config.costlockerApiToken" type="password" placeholder="Your API token" />
        </UFormField>
        <UButton @click="saveConfig">Save Configuration</UButton>
        <UBadge v-if="configSaved" color="success">Saved to browser</UBadge>
      </div>
    </UCard>

    <!-- Timetracker Connection Test -->
    <UCard>
      <template #header>
        <span class="font-semibold">STAGIL Timetracker Connection</span>
      </template>
      <div class="flex items-center gap-4">
        <UButton :loading="jiraTesting" variant="outline" @click="testJira">
          Test Connection
        </UButton>
        <UBadge v-if="jiraStatus" :color="jiraStatus.ok ? 'success' : 'error'">
          {{ jiraStatus.ok ? 'Connected' : jiraStatus.error }}
        </UBadge>
      </div>
    </UCard>

    <!-- Costlocker Connection Test -->
    <UCard>
      <template #header>
        <span class="font-semibold">Costlocker Connection</span>
      </template>
      <div class="flex items-center gap-4">
        <UButton :loading="costlockerTesting" variant="outline" @click="testCostlocker">
          Test Connection
        </UButton>
        <UBadge v-if="costlockerStatus" :color="costlockerStatus.ok ? 'success' : 'error'">
          {{ costlockerStatus.ok ? 'Connected' : costlockerStatus.error }}
        </UBadge>
      </div>
    </UCard>

    <!-- Project Mappings -->
    <UCard>
      <template #header>
        <div class="flex items-center justify-between">
          <span class="font-semibold">Project Mappings</span>
          <div class="flex gap-2">
            <UButton size="sm" variant="outline" :loading="loadingCL" @click="loadCostlockerData">
              Load Costlocker Data
            </UButton>
            <UButton size="sm" @click="addMapping">
              Add Mapping
            </UButton>
          </div>
        </div>
      </template>

      <div v-if="!mappings.length" class="text-sm text-gray-500">
        No mappings configured. Add a mapping to link Jira project keys to Costlocker budgets and activities.
      </div>

      <div v-else class="space-y-4">
        <div v-for="(m, i) in mappings" :key="i" class="flex items-end gap-4">
          <UFormField label="Jira Project Key">
            <UInput v-model="m.jiraProjectKey" placeholder="PROJ" />
          </UFormField>
          <UFormField label="Costlocker Budget (Project)">
            <USelect
              v-if="budgetOptions.length"
              v-model="m.costlockerBudgetId"
              :items="budgetOptions"
              value-key="value"
              class="w-full min-w-64"
            />
            <UInput v-else v-model.number="m.costlockerBudgetId" type="number" placeholder="Budget ID" />
          </UFormField>
          <UFormField label="Costlocker Activity (Task)">
            <USelect
              v-if="getActivityOptions(m.costlockerBudgetId).length"
              v-model="m.costlockerActivityId"
              :items="getActivityOptions(m.costlockerBudgetId)"
              label-key="label"
              value-key="value"
              class="w-full min-w-64"
            />
            <UInput v-else v-model.number="m.costlockerActivityId" type="number" placeholder="Activity ID" />
          </UFormField>
          <UButton color="error" variant="outline" size="sm" @click="removeMapping(i)">
            Remove
          </UButton>
        </div>
      </div>

      <template #footer>
        <div class="flex items-center gap-4">
          <UButton @click="saveMappingsAction">
            Save Mappings
          </UButton>
          <UBadge v-if="mappingSaved" color="success">Saved</UBadge>
        </div>
      </template>
    </UCard>
  </div>
</template>

<script setup lang="ts">
import type { CostlockerBudget } from '~/types'

const { config, mappings, load, save, saveMappings, authHeaders } = useConfig()

const configSaved = ref(false)
const jiraTesting = ref(false)
const jiraStatus = ref<{ ok: boolean; error?: string } | null>(null)
const costlockerTesting = ref(false)
const costlockerStatus = ref<{ ok: boolean; error?: string } | null>(null)

const mappingSaved = ref(false)

const budgets = ref<CostlockerBudget[]>([])
const loadingCL = ref(false)

const budgetOptions = computed(() =>
  budgets.value.map(b => ({
    label: b.companyName ? `${b.name} (${b.companyName})` : b.name,
    value: b.id,
  })),
)

function getActivityOptions(budgetId?: number) {
  if (!budgetId) return []
  const budget = budgets.value.find(b => b.id === budgetId)
  return budget?.activities.map(a => ({ label: a.name, value: a.id })) ?? []
}

function saveConfig() {
  save()
  configSaved.value = true
}

async function testJira() {
  jiraTesting.value = true
  try {
    jiraStatus.value = await $fetch('/api/jira/test', { headers: authHeaders() })
  }
  catch (err: any) {
    jiraStatus.value = { ok: false, error: err.data?.message || 'Request failed' }
  }
  finally {
    jiraTesting.value = false
  }
}

async function testCostlocker() {
  costlockerTesting.value = true
  try {
    costlockerStatus.value = await $fetch('/api/costlocker/test', { headers: authHeaders() })
  }
  catch (err: any) {
    costlockerStatus.value = { ok: false, error: err.data?.message || 'Request failed' }
  }
  finally {
    costlockerTesting.value = false
  }
}

async function loadCostlockerData() {
  loadingCL.value = true
  try {
    budgets.value = await $fetch<CostlockerBudget[]>('/api/costlocker/projects', { headers: authHeaders() })
  }
  catch {
    // user can type IDs manually
  }
  finally {
    loadingCL.value = false
  }
}

function addMapping() {
  mappings.value.push({ jiraProjectKey: '', costlockerBudgetId: 0, costlockerActivityId: 0 })
}

function removeMapping(index: number) {
  mappings.value.splice(index, 1)
}

function saveMappingsAction() {
  saveMappings()
  mappingSaved.value = true
}

onMounted(() => {
  load()
})
</script>
