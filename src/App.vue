<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { checkEnvironment, getCertificates, signDetachedCadesBes, type CertificateInfo } from './useCryptoPro'
import {
  base64ToBytes,
  base64ToUtf8,
  bytesToBase64,
  downloadBytes,
  isValidBase64,
  normalizeBase64,
  utf8ToBase64
} from './encoding'

type Status = 'idle' | 'loading' | 'ok' | 'error'

const env = ref<{ pluginVersion: string; cspVersion: string } | null>(null)
const envStatus = ref<Status>('loading')
const envError = ref('')

const certificates = ref<CertificateInfo[]>([])
const certsStatus = ref<Status>('idle')
const selectedThumbprint = ref('')

// Источник данных: вставленный XML, загруженный файл или готовая base64-строка XML.
const inputMode = ref<'text' | 'file' | 'base64'>('text')
const xmlText = ref(SAMPLE_XML())
const fileName = ref('')
const fileBase64 = ref('') // base64 байтов загруженного файла
const pastedBase64 = ref('') // base64 XML, пришедший из внешней системы — уходит на подпись как есть

const signStatus = ref<Status>('idle')
const signError = ref('')
const signatureBase64 = ref('')
const checkCertificate = ref(false) // для тестового сертификата корневой УЦ недоверенный

const selectedCert = computed(() => certificates.value.find((c) => c.thumbprint === selectedThumbprint.value))
const canSign = computed(
  () => !!selectedThumbprint.value && signStatus.value !== 'loading' && !!currentContentBase64.value
)

// base64 байтов, которые реально уйдут на подпись.
const currentContentBase64 = computed(() => {
  if (inputMode.value === 'file') return fileBase64.value
  if (inputMode.value === 'base64') return pastedBase64Valid.value ? normalizeBase64(pastedBase64.value) : ''
  return xmlText.value ? utf8ToBase64(xmlText.value) : ''
})

// Вставленную base64 не перекодируем — подписываем ровно те байты, что в ней закодированы.
// Поэтому только валидируем и показываем предпросмотр, чтобы было видно, что подписываем.
const pastedBase64Valid = computed(() => isValidBase64(pastedBase64.value))
const pastedBase64Preview = computed(() => {
  if (!pastedBase64Valid.value) return ''
  try {
    return base64ToUtf8(pastedBase64.value)
  } catch {
    return ''
  }
})

onMounted(async () => {
  try {
    env.value = await checkEnvironment()
    envStatus.value = 'ok'
  } catch (e) {
    envStatus.value = 'error'
    envError.value = e instanceof Error ? e.message : String(e)
  }
})

async function loadCertificates() {
  certsStatus.value = 'loading'
  try {
    certificates.value = await getCertificates()
    certsStatus.value = 'ok'
    if (certificates.value.length && !selectedThumbprint.value) {
      const firstValid = certificates.value.find((c) => c.isValid && c.hasPrivateKey)
      selectedThumbprint.value = (firstValid ?? certificates.value[0]).thumbprint
    }
  } catch (e) {
    certsStatus.value = 'error'
    signError.value = e instanceof Error ? e.message : String(e)
  }
}

async function onFilePicked(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  fileName.value = file.name
  const buf = await file.arrayBuffer()
  fileBase64.value = bytesToBase64(buf) // байты as-is, без перекодирования
  signatureBase64.value = ''
}

async function doSign() {
  signStatus.value = 'loading'
  signError.value = ''
  signatureBase64.value = ''
  try {
    signatureBase64.value = await signDetachedCadesBes(
      currentContentBase64.value,
      selectedThumbprint.value,
      checkCertificate.value
    )
    signStatus.value = 'ok'
  } catch (e) {
    signStatus.value = 'error'
    signError.value = e instanceof Error ? e.message : String(e)
  }
}

const baseName = computed(() => (inputMode.value === 'file' && fileName.value ? fileName.value : 'titul.xml'))

function downloadSigBinary() {
  // Оператору (Такском/ГИС ЭПД) обычно нужен бинарный DER: base64 -> байты.
  downloadBytes(base64ToBytes(signatureBase64.value), `${baseName.value}.sig`)
}
function downloadSigBase64() {
  downloadBytes(signatureBase64.value, `${baseName.value}.sig.txt`, 'text/plain')
}

function SAMPLE_XML() {
  // Заглушка вместо реального титула «по формату» ФНС ЕД-7-26/116@.
  // В боевом потоке XML отдаёт epl-integration байт-в-байт.
  return '<?xml version="1.0" encoding="UTF-8"?>\n<Файл ИдФайл="ON_PTLSODPARK_TEST">\n  <Документ>Тестовый титул ЭПЛ</Документ>\n</Файл>'
}
</script>

<template>
  <main>
    <h1>ЭПЛ · Отделённая подпись CAdES-BES</h1>
    <p class="lead">Тестовый стенд подписи титулов ЭПЛ через КриптоПро ЭЦП Browser plug-in.</p>

    <!-- 1. Окружение -->
    <section class="card">
      <h2>1. Окружение</h2>
      <div v-if="envStatus === 'loading'" class="muted">Проверяю плагин…</div>
      <div v-else-if="envStatus === 'ok'" class="ok">
        ✔ Плагин активен. Версия плагина: <b>{{ env?.pluginVersion }}</b>, КриптоПро CSP:
        <b>{{ env?.cspVersion }}</b>
      </div>
      <div v-else class="err">
        ✘ {{ envError }}
        <ul class="hint">
          <li>Установите КриптоПро CSP (пробный период 90 дней).</li>
          <li>Установите КриптоПро ЭЦП Browser plug-in и включите расширение в браузере.</li>
          <li>Перезапустите браузер после установки.</li>
        </ul>
      </div>
    </section>

    <!-- 2. Сертификат -->
    <section class="card">
      <h2>2. Сертификат</h2>
      <button :disabled="certsStatus === 'loading'" @click="loadCertificates">
        {{ certsStatus === 'loading' ? 'Загрузка…' : 'Загрузить сертификаты' }}
      </button>
      <div v-if="certsStatus === 'ok' && !certificates.length" class="muted" style="margin-top: 8px">
        В хранилище «Личное» (My) сертификатов не найдено.
      </div>
      <div v-if="certificates.length" class="field">
        <label>Подписант:</label>
        <select v-model="selectedThumbprint">
          <option v-for="c in certificates" :key="c.thumbprint" :value="c.thumbprint">
            {{ c.cn }} — до {{ new Date(c.validTo).toLocaleDateString('ru-RU') }}
            {{ c.isValid ? '' : '(недействителен)' }}{{ c.hasPrivateKey ? '' : ' (нет ключа)' }}
          </option>
        </select>
      </div>
      <table v-if="selectedCert" class="cert">
        <tbody>
          <tr><td>Кому выдан</td><td>{{ selectedCert.cn }}</td></tr>
          <tr><td>Издатель</td><td>{{ selectedCert.issuerCn }}</td></tr>
          <tr><td>Отпечаток</td><td class="mono">{{ selectedCert.thumbprint }}</td></tr>
          <tr><td>Действует</td><td>{{ new Date(selectedCert.validFrom).toLocaleDateString('ru-RU') }} — {{ new Date(selectedCert.validTo).toLocaleDateString('ru-RU') }}</td></tr>
          <tr><td>Закрытый ключ</td><td>{{ selectedCert.hasPrivateKey ? 'есть' : 'нет' }}</td></tr>
        </tbody>
      </table>
    </section>

    <!-- 3. Данные -->
    <section class="card">
      <h2>3. Данные для подписи (XML титула)</h2>
      <div class="tabs">
        <button :class="{ active: inputMode === 'text' }" @click="inputMode = 'text'">Вставить XML</button>
        <button :class="{ active: inputMode === 'file' }" @click="inputMode = 'file'">Загрузить файл</button>
        <button :class="{ active: inputMode === 'base64' }" @click="inputMode = 'base64'">Вставить base64</button>
      </div>
      <textarea v-if="inputMode === 'text'" v-model="xmlText" rows="10" spellcheck="false"></textarea>
      <div v-else-if="inputMode === 'file'" class="field">
        <input type="file" accept=".xml,text/xml,application/xml" @change="onFilePicked" />
        <span v-if="fileName" class="muted"> {{ fileName }} ({{ base64ToBytes(fileBase64).length }} байт)</span>
      </div>
      <template v-else>
        <textarea
          v-model="pastedBase64"
          rows="6"
          spellcheck="false"
          placeholder="base64 XML-титула, как его отдаёт epl-integration"
        ></textarea>
        <div v-if="pastedBase64 && !pastedBase64Valid" class="err">✘ Это не корректная base64-строка.</div>
        <div v-else-if="pastedBase64Valid" class="muted">
          ✔ {{ base64ToBytes(pastedBase64).length }} байт — подписываются как есть, без перекодирования.
        </div>
        <template v-if="pastedBase64Preview">
          <label class="muted">Предпросмотр (декодировано как UTF-8):</label>
          <textarea readonly rows="8" spellcheck="false" :value="pastedBase64Preview"></textarea>
        </template>
      </template>
      <p class="note">
        ⚠ Подпись отделённая — считается от точных байтов этих данных. В боевом потоке XML должен приходить
        из epl-integration байт-в-байт; переформатировать его после подписи нельзя.
      </p>
    </section>

    <!-- 4. Подпись -->
    <section class="card">
      <h2>4. Подпись</h2>
      <label class="check">
        <input type="checkbox" v-model="checkCertificate" />
        Проверять цепочку сертификата (для тестового сертификата оставьте выключенным — иначе 0x800B0109)
      </label>
      <button class="primary" :disabled="!canSign" @click="doSign">
        {{ signStatus === 'loading' ? 'Подписываю…' : 'Подписать (detached CAdES-BES)' }}
      </button>
      <div v-if="signStatus === 'error'" class="err" style="margin-top: 12px">✘ {{ signError }}</div>
      <div v-if="signatureBase64" class="result">
        <div class="ok">✔ Подпись сформирована ({{ base64ToBytes(signatureBase64).length }} байт DER)</div>
        <div class="actions">
          <button @click="downloadSigBinary">Скачать {{ baseName }}.sig (DER)</button>
          <button @click="downloadSigBase64">Скачать base64</button>
        </div>
        <label class="muted">Подпись (base64):</label>
        <textarea readonly rows="6" :value="signatureBase64"></textarea>
      </div>
    </section>
  </main>
</template>
