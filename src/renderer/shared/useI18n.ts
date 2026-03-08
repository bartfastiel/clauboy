import { useState, useEffect } from 'react'
import en from '../../../i18n/en.json'
import de from '../../../i18n/de.json'

type Translations = typeof en
type Language = 'en' | 'de'

const translations: Record<Language, Translations> = { en, de }

export function useI18n(): { t: (key: string) => string; language: Language } {
  const [language, setLanguage] = useState<Language>('en')

  useEffect(() => {
    window.clauboy.getConfig().then((config) => {
      if (config.language === 'de' || config.language === 'en') {
        setLanguage(config.language)
      }
    }).catch(() => {
      // Fallback to English
    })
  }, [])

  const t = (key: string): string => {
    const dict = translations[language] as Record<string, string>
    return dict[key] ?? key
  }

  return { t, language }
}
