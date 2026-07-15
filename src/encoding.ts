// Кодирование данных для подписи и выгрузки .sig.
// Всё аккуратно на уровне байтов — для detached-подписи расхождение хоть в одном байте
// (кодировка, BOM, переносы строк) сделает подпись невалидной на стороне оператора.

/** ArrayBuffer/Uint8Array -> base64. */
export function bytesToBase64(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
  let binary = ''
  const chunk = 0x8000 // избегаем переполнения стека при String.fromCharCode(...spread)
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** base64 -> Uint8Array (для сохранения бинарного DER-файла .sig). */
export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s+/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

/** Строку XML -> base64 её UTF-8 байтов (без BOM). */
export function utf8ToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text))
}

/** base64 -> текст UTF-8 (для предпросмотра вставленной base64-строки). */
export function base64ToUtf8(b64: string): string {
  return new TextDecoder('utf-8').decode(base64ToBytes(b64))
}

/**
 * Убирает переносы/пробелы из base64. Плагин и внешние системы часто отдают
 * base64 в столбик по 64 символа — на подпись должна уходить одна строка.
 */
export function normalizeBase64(b64: string): string {
  return b64.replace(/\s+/g, '')
}

/** Проверка, что строка — корректный base64 (после нормализации). */
export function isValidBase64(b64: string): boolean {
  const s = normalizeBase64(b64)
  if (!s || s.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(s)) return false
  try {
    atob(s)
    return true
  } catch {
    return false
  }
}

/** Скачать данные как файл. */
export function downloadBytes(bytes: Uint8Array | string, filename: string, mime = 'application/octet-stream') {
  const blobPart = typeof bytes === 'string' ? bytes : (bytes.buffer as ArrayBuffer)
  const blob = new Blob([blobPart], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
