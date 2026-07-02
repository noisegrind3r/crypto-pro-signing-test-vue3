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
