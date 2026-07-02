// Обёртка над КриптоПро ЭЦП Browser plug-in (асинхронный API).
// Задача стенда: сформировать ОТДЕЛЁННУЮ (detached) подпись CAdES-BES над байтами
// XML-титула ЭПЛ — ровно то, что Такском/ГИС ЭПД принимают как файл `sig` к файлу `file`.

// Константы CAdESCOM/CAPICOM (дублируем численно на случай старых сборок плагина).
const CADESCOM_CADES_BES = 1
const CADESCOM_BASE64_TO_BINARY = 1
const CAPICOM_CURRENT_USER_STORE = 2
const CAPICOM_MY_STORE = 'My'
const CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED = 2
const CAPICOM_CERTIFICATE_FIND_SHA1_HASH = 0

export interface CertificateInfo {
  thumbprint: string
  subject: string        // сырой DN
  cn: string             // извлечённый CN (кому выдан)
  issuerCn: string       // CN издателя
  validFrom: string
  validTo: string
  isValid: boolean       // прошёл ли cert.IsValid()
  hasPrivateKey: boolean
}

const NOT_FOUND =
  'Объект cadesplugin не найден. Проверьте, что подключён cadesplugin_api.js, ' +
  'установлены КриптоПро CSP, браузерный плагин и расширение.'

/**
 * Ждём активации плагина и возвращаем API В ОБЁРТКЕ { api }.
 *
 * Важно: сам объект cadesplugin — thenable (у него есть .then). Если вернуть его напрямую
 * из async-функции, промис РАЗВЕРНЁТ thenable и отдаст undefined вместо объекта. Поэтому
 * оборачиваем в не-thenable контейнер. После активации перечитываем window.cadesplugin —
 * некоторые сборки api переустанавливают объект в процессе загрузки.
 */
async function getPlugin(): Promise<{ api: CadesPlugin }> {
  const bootstrap = window.cadesplugin
  if (!bootstrap) throw new Error(NOT_FOUND)
  await (bootstrap as unknown as PromiseLike<void>) // резолвится после загрузки плагина
  const api = window.cadesplugin
  if (!api) throw new Error(NOT_FOUND)
  return { api }
}

/** Достаёт человекочитаемый текст из COM-исключения плагина. */
function describeError(e: unknown): string {
  const plugin = window.cadesplugin
  if (plugin?.getLastError) {
    try {
      const msg = plugin.getLastError(e)
      if (msg) return msg
    } catch {
      /* ignore */
    }
  }
  if (e instanceof Error) return e.message
  return String(e)
}

/** Парсит CN из строки DN вида "CN=Иванов, O=..., ...". */
function extractCn(dn: string): string {
  const m = /(?:^|,\s*)CN=([^,]+)/i.exec(dn ?? '')
  return m ? m[1].trim() : (dn ?? '')
}

/** Проверка, что окружение готово: плагин активен, CSP отвечает. Возвращает версию плагина. */
export async function checkEnvironment(): Promise<{ pluginVersion: string; cspVersion: string }> {
  const { api: plugin } = await getPlugin()
  const about = await plugin.CreateObjectAsync('CAdESCOM.About')
  const pluginVersionObj = await about.PluginVersion
  const pluginVersion = pluginVersionObj
    ? `${await pluginVersionObj.MajorVersion}.${await pluginVersionObj.MinorVersion}.${await pluginVersionObj.BuildVersion}`
    : String(await about.Version)
  let cspVersion = ''
  try {
    const csp = await about.CSPVersion('', 80) // 80 = PROV_GOST_2012_256
    cspVersion = `${await csp.MajorVersion}.${await csp.MinorVersion}.${await csp.BuildVersion}`
  } catch {
    cspVersion = 'не определена'
  }
  return { pluginVersion, cspVersion }
}

/** Список сертификатов из личного хранилища (My) текущего пользователя. */
export async function getCertificates(): Promise<CertificateInfo[]> {
  const { api: plugin } = await getPlugin()
  const store = await plugin.CreateObjectAsync('CAdESCOM.Store')
  await store.Open(CAPICOM_CURRENT_USER_STORE, CAPICOM_MY_STORE, CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED)

  const result: CertificateInfo[] = []
  try {
    const certs = await store.Certificates
    const count = await certs.Count
    for (let i = 1; i <= count; i++) {
      const cert = await certs.Item(i)
      const subject: string = await cert.SubjectName
      const issuer: string = await cert.IssuerName

      let isValid = false
      try {
        const validity = await cert.IsValid()
        isValid = await validity.Result
      } catch {
        isValid = false
      }
      let hasPrivateKey = false
      try {
        hasPrivateKey = await cert.HasPrivateKey()
      } catch {
        hasPrivateKey = false
      }

      result.push({
        thumbprint: await cert.Thumbprint,
        subject,
        cn: extractCn(subject),
        issuerCn: extractCn(issuer),
        validFrom: await cert.ValidFromDate,
        validTo: await cert.ValidToDate,
        isValid,
        hasPrivateKey
      })
    }
  } finally {
    await store.Close()
  }
  return result
}

/**
 * Отделённая подпись CAdES-BES над байтами, закодированными в base64.
 * Возвращает подпись в base64 (PKCS#7 / CAdES).
 *
 * ВАЖНО: contentBase64 должен быть base64 ИМЕННО ОТ БАЙТОВ файла XML, который уйдёт оператору,
 * а ContentEncoding = BASE64_TO_BINARY — чтобы хэш считался от байтов, а не от текста.
 */
export async function signDetachedCadesBes(
  contentBase64: string,
  thumbprint: string,
  // Проверка цепочки сертификата. Для тестового сертификата (недоверенный корневой УЦ КриптоПро)
  // держим false — иначе 0x800B0109 CERT_E_UNTRUSTEDROOT. В бою имеет смысл включить.
  checkCertificate = false
): Promise<string> {
  const { api: plugin } = await getPlugin()
  const store = await plugin.CreateObjectAsync('CAdESCOM.Store')
  await store.Open(CAPICOM_CURRENT_USER_STORE, CAPICOM_MY_STORE, CAPICOM_STORE_OPEN_MAXIMUM_ALLOWED)

  try {
    const certs = await store.Certificates
    const findKind = plugin.CAPICOM_CERTIFICATE_FIND_SHA1_HASH ?? CAPICOM_CERTIFICATE_FIND_SHA1_HASH
    const found = await certs.Find(findKind, thumbprint)
    if ((await found.Count) === 0) {
      throw new Error(`Сертификат с отпечатком ${thumbprint} не найден в хранилище My.`)
    }
    const cert = await found.Item(1)

    const signer = await plugin.CreateObjectAsync('CAdESCOM.CPSigner')
    await signer.propset_Certificate(cert)
    await signer.propset_CheckCertificate(checkCertificate)

    const signedData = await plugin.CreateObjectAsync('CAdESCOM.CadesSignedData')
    await signedData.propset_ContentEncoding(plugin.CADESCOM_BASE64_TO_BINARY ?? CADESCOM_BASE64_TO_BINARY)
    await signedData.propset_Content(contentBase64)

    // 3-й аргумент true => detached (отделённая) подпись.
    const signature: string = await signedData.SignCades(
      signer,
      plugin.CADESCOM_CADES_BES ?? CADESCOM_CADES_BES,
      true
    )
    return signature
  } catch (e) {
    throw new Error(describeError(e))
  } finally {
    await store.Close()
  }
}
