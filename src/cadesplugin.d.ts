// Минимальная декларация глобального объекта cadesplugin из cadesplugin_api.js.
// API асинхронный: методы объектов возвращают Promise, работаем через await.
// Полные типы не описываем — только то, что используем; остальное `any`.

// Не наследуем PromiseLike: иначе `await getPlugin()` развернул бы объект в void.
// Ждать активацию плагина будем кастом `plugin as unknown as PromiseLike<void>`.
declare global {
  interface CadesPlugin {
    CreateObjectAsync(name: string): Promise<any>

    // Числовые константы, которые отдаёт сам плагин (используем их вместо «магии»).
    CAPICOM_CERTIFICATE_FIND_SHA1_HASH: number
    CADESCOM_CADES_BES: number
    CADESCOM_BASE64_TO_BINARY: number
    CAPICOM_CURRENT_USER_STORE: number
    CAPICOM_MY_STORE: string
    CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED: number

    // Хелпер для читаемого текста ошибки COM-исключения (есть не во всех сборках).
    getLastError?(e: unknown): string
  }

  interface Window {
    cadesplugin?: CadesPlugin
  }
}

export {}
